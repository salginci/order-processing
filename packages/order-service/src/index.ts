import express from 'express';
import { Pool } from 'pg';
import { PubSub } from '@google-cloud/pubsub';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.NODE_ENV === 'production' ? process.env.PORT || 8080 : process.env.ORDER_PORT || 3000;

// Create PostgreSQL connection pool
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME
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
  customer_id: string;
  cart_id: string;
  total_amount: number;
  items: Array<{
    product_sku: string;
    quantity: number;
    price: number;
  }>;
}

interface StockAvailableEvent {
  cart_id: string;
  customer_id: string;
  items: Array<{
    product_sku: string;
    quantity: number;
    price: number;
  }>;
}

// Initialize database
async function initializeDatabase() {
  try {
    // Create orders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        customer_id VARCHAR(50) NOT NULL,
        cart_id VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        total_amount DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create order_items table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL,
        product_sku VARCHAR(50) NOT NULL,
        quantity INTEGER NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      )
    `);

    // Create processed_messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS processed_messages (
        id SERIAL PRIMARY KEY,
        message_id VARCHAR(255) NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        service_name VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL,
        processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        error_message TEXT,
        UNIQUE(message_id, service_name)
      )
    `);

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
      CREATE INDEX IF NOT EXISTS idx_orders_cart_id ON orders(cart_id);
      CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_processed_messages_message_id ON processed_messages(message_id);
      CREATE INDEX IF NOT EXISTS idx_processed_messages_service_name ON processed_messages(service_name);
    `);

    console.log('Order service database initialized successfully');
  } catch (error) {
    console.error('Error initializing order service database:', error);
    process.exit(1);
  }
}

// Add idempotency handling functions
async function isMessageProcessed(messageId: string): Promise<boolean> {
  try {
    const result = await pool.query(
      'SELECT id FROM processed_messages WHERE message_id = $1 AND service_name = $2',
      [messageId, 'order-service']
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking if message is processed:', error);
    // If we can't check, assume message is not processed to be safe
    return false;
  }
}

async function markMessageProcessed(
  messageId: string, 
  eventType: string, 
  status: 'success' | 'failed',
  errorMessage?: string
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO processed_messages 
       (message_id, event_type, service_name, status, error_message)
       VALUES ($1, $2, $3, $4, $5)`,
      [messageId, eventType, 'order-service', status, errorMessage]
    );
  } catch (error) {
    console.error('Error marking message as processed:', error);
    // Don't throw here as this is a secondary operation
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
        // Check if message is already processed
        if (await isMessageProcessed(message.id)) {
          console.log('Message already processed, skipping:', message.id);
          message.ack();
          return;
        }

        const data = JSON.parse(message.data.toString()) as StockAvailableEvent;
        console.log('Received stock available event:', data);
        
        // Create order with initial total amount
        const initialTotal = data.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        const orderResult = await pool.query(
          `INSERT INTO orders (customer_id, cart_id, status, total_amount)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [data.customer_id, data.cart_id, 'created', initialTotal]
        );

        const orderId = orderResult.rows[0].id;

        // Add order items
        for (const item of data.items) {
          await pool.query(
            `INSERT INTO order_items (order_id, product_sku, quantity, price)
             VALUES ($1, $2, $3, $4)`,
            [orderId, item.product_sku, item.quantity, item.price]
          );
        }

        // Publish order created event
        const orderCreatedEvent: OrderCreatedEvent = {
          order_id: orderId.toString(),
          customer_id: data.customer_id,
          cart_id: data.cart_id,
          total_amount: initialTotal,
          items: data.items.map(item => ({
            product_sku: item.product_sku,
            quantity: item.quantity,
            price: item.price
          }))
        };

        await orderCreatedTopic.publishMessage({
          data: Buffer.from(JSON.stringify(orderCreatedEvent))
        });

        // Mark message as processed on success
        await markMessageProcessed(message.id, 'stock-available', 'success');
        message.ack();
      } catch (error) {
        console.error('Error processing stock available event:', error);
        // Mark message as failed
        await markMessageProcessed(
          message.id, 
          'stock-available', 
          'failed', 
          error instanceof Error ? error.message : 'Unknown error'
        );
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