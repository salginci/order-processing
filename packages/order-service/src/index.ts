import express from 'express';
import { Pool } from 'pg';
import { PubSub } from '@google-cloud/pubsub';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.ORDER_PORT || 3000;

// Create PostgreSQL connection pool
const pool = new Pool({
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DATABASE
});

// Initialize Pub/Sub
const pubsub = new PubSub();

// Define topics
const stockAvailableTopic = pubsub.topic('stock-available');
const orderCreatedTopic = pubsub.topic('order.created');

// Define interfaces
interface Order {
  id: string;
  cart_id: string;
  customer_id: string;
  status: 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled';
  created_at: Date;
  updated_at: Date;
}

interface OrderCreatedEvent {
  order_id: string;
  cart_id: string;
  customer_id: string;
  status: 'confirmed';
  items: Array<{
    product_sku: string;
    quantity: number;
  }>;
}

interface StockAvailableEvent {
  cart_id: string;
  customer_id: string;
  items: Array<{
    product_sku: string;
    quantity: number;
  }>;
}

// Initialize database
async function initializeDatabase() {
  try {
    // Create orders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        customer_id VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        total_amount DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL,
        product_sku VARCHAR(50) NOT NULL,
        quantity INTEGER NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_sku) REFERENCES products(sku) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_order_items_product_sku ON order_items(product_sku);
    `);

    console.log('Order database initialized successfully');
  } catch (error) {
    console.error('Error initializing order database:', error);
    process.exit(1);
  }
}

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/', (req: express.Request, res: express.Response) => {
  res.json({
    status: 'healthy',
    service: 'order-service',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Create order
app.post('/orders', async (req, res) => {
  const { customer_id, cart_id } = req.body;

  if (!customer_id || !cart_id) {
    return res.status(400).json({ error: 'Customer ID and Cart ID are required' });
  }

  const client = await pool.connect();
  try {
    // Start transaction
    await client.query('BEGIN');

    // Get cart and items
    const cartResult = await client.query('SELECT * FROM carts WHERE id = $1 AND customer_id = $2', [cart_id, customer_id]);
    if (cartResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cart not found' });
    }

    const cart = cartResult.rows[0];
    if (cart.is_locked) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cart is already locked (order exists)' });
    }

    const cartItems = await client.query('SELECT * FROM cart_items WHERE cart_id = $1', [cart_id]);

    // Create order
    const orderResult = await client.query(
      'INSERT INTO orders (customer_id, total_amount, status) VALUES ($1, $2, $3) RETURNING *',
      [customer_id, cart.total_amount, 'pending']
    );
    const order = orderResult.rows[0];

    // Create order items
    for (const item of cartItems.rows) {
      await client.query(
        'INSERT INTO order_items (order_id, product_sku, quantity, price) VALUES ($1, $2, $3, $4)',
        [order.id, item.product_sku, item.quantity, item.price]
      );
    }

    // Lock the cart
    await client.query('UPDATE carts SET is_locked = TRUE WHERE id = $1', [cart_id]);

    // Commit transaction
    await client.query('COMMIT');

    // Publish order created event
    await pubsub.topic('order.created').publishMessage({
      data: Buffer.from(JSON.stringify({
        event: 'order.created',
        order_id: order.id,
        customer_id: order.customer_id,
        total_amount: order.total_amount,
        cart_id: cart_id
      }))
    });

    res.status(201).json(order);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Get order details
app.get('/orders/:id', async (req: express.Request, res: express.Response) => {
  try {
    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE id = $1',
      [req.params.id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];
    const itemsResult = await pool.query(
      'SELECT oi.*, p.name as product_name FROM order_items oi JOIN products p ON oi.product_sku = p.sku WHERE order_id = $1',
      [order.id]
    );

    res.json({
      ...order,
      items: itemsResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Cancel order
app.put('/orders/:orderId/cancel', async (req, res) => {
  const { orderId } = req.params;
  const { reason } = req.body;

  const client = await pool.connect();
  try {
    // Start transaction
    await client.query('BEGIN');

    // Get order
    const orderResult = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];
    if (order.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Order is already cancelled' });
    }

    // Get order items
    const itemsResult = await client.query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [orderId]
    );
    const orderItems = itemsResult.rows;

    // Update order status
    await client.query('UPDATE orders SET status = $1 WHERE id = $2', ['cancelled', orderId]);

    // Get cart ID from order items
    const cartResult = await client.query(
      'SELECT cart_id FROM order_items WHERE order_id = $1 LIMIT 1',
      [orderId]
    );

    if (cartResult.rows.length > 0) {
      // Unlock the cart
      await client.query('UPDATE carts SET is_locked = FALSE WHERE id = $1', [cartResult.rows[0].cart_id]);
    }

    // Commit transaction
    await client.query('COMMIT');

    // Publish order cancelled event with items
    await pubsub.topic('order.cancelled').publishMessage({
      data: Buffer.from(JSON.stringify({
        event: 'order.cancelled',
        order_id: order.id,
        customer_id: order.customer_id,
        cart_id: cartResult.rows[0]?.cart_id,
        reason: reason || 'Customer request',
        items: orderItems.map(item => ({
          product_sku: item.product_sku,
          quantity: item.quantity
        }))
      }))
    });

    res.json({ 
      ...order, 
      status: 'cancelled',
      items: orderItems
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cancelling order:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Subscribe to topics
async function subscribeToTopics() {
  try {
    const stockAvailableSubscription = pubsub.subscription('order-service-stock-available');
    
    stockAvailableSubscription.on('message', async (message) => {
      try {
        const data = JSON.parse(message.data.toString()) as StockAvailableEvent;
        console.log('Received stock available event:', data);
        
        // Create new order
        const result = await pool.query(
          `INSERT INTO orders (cart_id, customer_id, status)
           VALUES ($1, $2, $3)
           RETURNING *`,
          [data.cart_id, data.customer_id, 'confirmed']
        );
        
        const order = result.rows[0];
        
        // Publish order.created event
        const orderCreatedEvent: OrderCreatedEvent = {
          order_id: order.id,
          cart_id: order.cart_id,
          customer_id: order.customer_id,
          status: 'confirmed',
          items: data.items
        };
        
        await orderCreatedTopic.publishMessage({
          data: Buffer.from(JSON.stringify(orderCreatedEvent))
        });
        
        console.log('Created order and published order.created event:', orderCreatedEvent);
        message.ack();
      } catch (error) {
        console.error('Error processing stock available event:', error);
        message.nack();
      }
    });

    console.log('Order service subscribed to topics successfully');
  } catch (error) {
    console.error('Error setting up PubSub subscriptions:', error);
  }
}

// Initialize database and start server
initializeDatabase().then(() => {
  app.listen(port, () => {
    console.log(`Order service listening at http://localhost:${port}`);
  });
}); 