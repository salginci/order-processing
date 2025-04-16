import express from 'express';
import { Pool } from 'pg';
import { PubSub } from '@google-cloud/pubsub';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.NODE_ENV === 'production' ? process.env.PORT || 8080 : process.env.CART_PORT || 3005;

// Create PostgreSQL connection pool
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME
});

// Initialize PubSub
const pubsub = new PubSub();

// Define topics
const orderRequestedTopic = pubsub.topic('order-requested');
const stockRejectedTopic = pubsub.topic('stock.rejected');
const stockAvailableTopic = pubsub.topic('stock-available');

// Define interfaces
interface Cart {
  id: string;
  customer_id: string;
  cart_locked: boolean;
  status: 'active' | 'processing' | 'stock-unavailable';
  created_at: Date;
  updated_at: Date;
}

interface CartItem {
  id: string;
  cart_id: string;
  product_sku: string;
  quantity: number;
  created_at: Date;
  updated_at: Date;
}

interface OrderRequestedEvent {
  cart_id: string;
  customer_id: string;
  items: Array<{
    product_sku: string;
    quantity: number;
  }>;
}

interface StockRejectedEvent {
  cart_id: string;
  customer_id: string;
  reason: 'insufficient_stock';
  details: Array<{
    product_sku: string;
    requested: number;
    available: number;
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

// Create tables if they don't exist
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS carts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID NOT NULL,
        cart_locked BOOLEAN DEFAULT FALSE,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cart_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
        product_sku VARCHAR(255) NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(cart_id, product_sku)
      );
    `);
    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'cart-service',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Get current cart
app.get('/cart', async (req, res) => {
  const customerId = req.headers['x-customer-id'] as string;
  
  if (!customerId) {
    return res.status(400).json({ error: 'Customer ID is required' });
  }

  const client = await pool.connect();
  try {
    // Get or create cart
    const cartResult = await client.query(
      `SELECT * FROM carts WHERE customer_id = $1 AND cart_locked = FALSE`,
      [customerId]
    );

    if (cartResult.rows.length === 0) {
      return res.json({ cart: null, items: [] });
    }

    const cart = cartResult.rows[0];

    // Get cart items
    const itemsResult = await client.query(
      `SELECT * FROM cart_items WHERE cart_id = $1`,
      [cart.id]
    );

    res.json({
      cart,
      items: itemsResult.rows
    });
  } catch (error) {
    console.error('Error getting cart:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Add item to cart
app.post('/cart/items', async (req, res) => {
  const customerId = req.headers['x-customer-id'] as string;
  const { product_sku, quantity } = req.body;
  
  if (!customerId) {
    return res.status(400).json({ error: 'Customer ID is required' });
  }

  if (!product_sku || !quantity || quantity < 1) {
    return res.status(400).json({ error: 'Product SKU and valid quantity are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get or create cart
    let cartResult = await client.query(
      `SELECT * FROM carts WHERE customer_id = $1 AND cart_locked = FALSE`,
      [customerId]
    );

    let cart: Cart;
    if (cartResult.rows.length === 0) {
      // Create new cart
      const newCartResult = await client.query(
        `INSERT INTO carts (customer_id) VALUES ($1) RETURNING *`,
        [customerId]
      );
      cart = newCartResult.rows[0];
    } else {
      cart = cartResult.rows[0];
    }

    // Add or update item
    await client.query(`
      INSERT INTO cart_items (cart_id, product_sku, quantity)
      VALUES ($1, $2, $3)
      ON CONFLICT (cart_id, product_sku)
      DO UPDATE SET quantity = cart_items.quantity + $3
    `, [cart.id, product_sku, quantity]);

    await client.query('COMMIT');

    // Get updated cart with items
    const updatedCartResult = await client.query(
      `SELECT * FROM carts WHERE id = $1`,
      [cart.id]
    );
    const itemsResult = await client.query(
      `SELECT * FROM cart_items WHERE cart_id = $1`,
      [cart.id]
    );

    res.json({
      cart: updatedCartResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding item to cart:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Remove item from cart
app.delete('/cart/items/:product_sku', async (req, res) => {
  const customerId = req.headers['x-customer-id'] as string;
  const { product_sku } = req.params;
  
  if (!customerId) {
    return res.status(400).json({ error: 'Customer ID is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get active cart
    const cartResult = await client.query(
      `SELECT * FROM carts WHERE customer_id = $1 AND cart_locked = FALSE`,
      [customerId]
    );

    if (cartResult.rows.length === 0) {
      return res.status(404).json({ error: 'No active cart found' });
    }

    const cart = cartResult.rows[0];

    // Remove item
    await client.query(
      `DELETE FROM cart_items WHERE cart_id = $1 AND product_sku = $2`,
      [cart.id, product_sku]
    );

    await client.query('COMMIT');

    // Get updated cart with items
    const updatedCartResult = await client.query(
      `SELECT * FROM carts WHERE id = $1`,
      [cart.id]
    );
    const itemsResult = await client.query(
      `SELECT * FROM cart_items WHERE cart_id = $1`,
      [cart.id]
    );

    res.json({
      cart: updatedCartResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error removing item from cart:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Convert cart to order
app.post('/cart/convert-to-order', async (req, res) => {
  const customerId = req.headers['x-customer-id'] as string;
  
  if (!customerId) {
    return res.status(400).json({ error: 'Customer ID is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get active cart
    const cartResult = await client.query(
      `SELECT * FROM carts WHERE customer_id = $1 AND cart_locked = FALSE`,
      [customerId]
    );

    if (cartResult.rows.length === 0) {
      return res.status(404).json({ error: 'No active cart found' });
    }

    const cart = cartResult.rows[0];

    // Get cart items
    const itemsResult = await client.query(
      `SELECT * FROM cart_items WHERE cart_id = $1`,
      [cart.id]
    );

    if (itemsResult.rows.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Lock the cart
    await client.query(
      `UPDATE carts SET cart_locked = TRUE WHERE id = $1`,
      [cart.id]
    );

    // Prepare order requested event
    const event: OrderRequestedEvent = {
      cart_id: cart.id,
      customer_id: cart.customer_id,
      items: itemsResult.rows.map(item => ({
        product_sku: item.product_sku,
        quantity: item.quantity
      }))
    };

    // Publish event
    await orderRequestedTopic.publishMessage({
      json: event
    });

    await client.query('COMMIT');

    res.json({
      message: 'Cart converted to order successfully',
      cart_id: cart.id,
      status: 'processing'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error converting cart to order:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Subscribe to topics
async function subscribeToTopics() {
  try {
    const stockRejectedSubscription = pubsub.subscription('cart-service-stock-rejected');
    const stockAvailableSubscription = pubsub.subscription('cart-service-stock-available');
    
    stockRejectedSubscription.on('message', async (message) => {
      try {
        const data = JSON.parse(message.data.toString()) as StockRejectedEvent;
        console.log('Received stock rejected event:', data);
        
        // Update cart status to stock-unavailable
        await pool.query(
          'UPDATE carts SET status = $1 WHERE id = $2',
          ['stock-unavailable', data.cart_id]
        );
        
        message.ack();
      } catch (error) {
        console.error('Error processing stock rejected event:', error);
        message.nack();
      }
    });

    stockAvailableSubscription.on('message', async (message) => {
      try {
        const data = JSON.parse(message.data.toString()) as StockAvailableEvent;
        console.log('Received stock available event:', data);
        
        // Update order status to confirmed
        await pool.query(
          'UPDATE orders SET status = $1 WHERE cart_id = $2',
          ['confirmed', data.cart_id]
        );
        
        message.ack();
      } catch (error) {
        console.error('Error processing stock available event:', error);
        message.nack();
      }
    });

    console.log('Cart service subscribed to topics successfully');
  } catch (error) {
    console.error('Error setting up PubSub subscriptions:', error);
  }
}

// Start the server
app.listen(port, async () => {
  try {
    await initializeDatabase();
    await subscribeToTopics();
    console.log(`Cart service listening at http://localhost:${port}`);
  } catch (error) {
    console.error('Failed to start cart service:', error);
    process.exit(1);
  }
}); 