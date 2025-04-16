import express from 'express';
import { Pool } from 'pg';
import { PubSub } from '@google-cloud/pubsub';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.INVENTORY_PORT || 3001;

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
const orderRequestedTopic = pubsub.topic('order-requested');
const inventoryStatusTopic = pubsub.topic('inventory-status');
const stockRejectedTopic = pubsub.topic('stock.rejected');
const stockAvailableTopic = pubsub.topic('stock-available');

// Define interfaces
interface OrderRequestedEvent {
  cart_id: string;
  customer_id: string;
  items: Array<{
    product_sku: string;
    quantity: number;
  }>;
}

interface InventoryStatusEvent {
  cart_id: string;
  customer_id: string;
  status: 'sufficient' | 'insufficient';
  details: Array<{
    product_sku: string;
    requested: number;
    available: number;
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
    available: number;
  }>;
}

interface OrderCancelledEvent {
  order_id: string;
  customer_id: string;
  cart_id: string;
  reason: string;
  items: Array<{
    product_sku: string;
    quantity: number;
  }>;
}

// Initialize database
async function checkProductsTable() {
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'products'
      );
    `);
    return result.rows[0].exists;
  } catch (error) {
    return false;
  }
}

async function checkSampleProducts() {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) FROM products 
      WHERE sku IN ('LAP-001', 'PHN-001', 'HPH-001', 'WCH-001', 'TAB-001')
    `);
    return parseInt(result.rows[0].count) === 5;
  } catch (error) {
    return false;
  }
}

async function initializeDatabase() {
  try {
    // Wait for products table to exist
    let retries = 30;
    while (retries > 0) {
      if (await checkProductsTable()) {
        console.log('Products table exists');
        break;
      }
      console.log('Waiting for products table to be created...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      retries--;
    }

    if (retries === 0) {
      throw new Error('Timeout waiting for products table');
    }

    // Create inventory table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        product_sku VARCHAR(50) NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        min_quantity INTEGER NOT NULL DEFAULT 5,
        max_quantity INTEGER NOT NULL DEFAULT 100,
        status VARCHAR(50) NOT NULL DEFAULT 'in_stock',
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_sku) REFERENCES products(sku) ON DELETE CASCADE
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
      CREATE INDEX IF NOT EXISTS idx_inventory_product_sku ON inventory(product_sku);
      CREATE INDEX IF NOT EXISTS idx_processed_messages_message_id ON processed_messages(message_id);
      CREATE INDEX IF NOT EXISTS idx_processed_messages_service_name ON processed_messages(service_name);
    `);

    // Wait for sample products to exist
    retries = 30;
    while (retries > 0) {
      if (await checkSampleProducts()) {
        console.log('Sample products exist');
        break;
      }
      console.log('Waiting for sample products...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      retries--;
    }

    if (retries === 0) {
      throw new Error('Timeout waiting for sample products');
    }

    // Check if we have any inventory items
    const result = await pool.query('SELECT COUNT(*) FROM inventory');
    if (result.rows[0].count === '0') {
      // Insert initial inventory for sample products
      await pool.query(`
        INSERT INTO inventory (product_sku, quantity, min_quantity, max_quantity) VALUES
        ('LAP-001', 10, 5, 50),
        ('PHN-001', 20, 10, 100),
        ('HPH-001', 30, 15, 150),
        ('WCH-001', 15, 5, 75),
        ('TAB-001', 25, 10, 100)
      `);
      console.log('Initial inventory inserted');
    }

    console.log('Inventory database initialized successfully');
  } catch (error) {
    console.error('Error initializing inventory database:', error);
    process.exit(1);
  }
}

// Add idempotency handling functions
async function isMessageProcessed(messageId: string): Promise<boolean> {
  try {
    const result = await pool.query(
      'SELECT id FROM processed_messages WHERE message_id = $1 AND service_name = $2',
      [messageId, 'inventory-service']
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
      [messageId, eventType, 'inventory-service', status, errorMessage]
    );
  } catch (error) {
    console.error('Error marking message as processed:', error);
    // Don't throw here as this is a secondary operation
  }
}

// Subscribe to topics
async function subscribeToTopics() {
  try {
    const orderRequestedSubscription = pubsub.subscription('inventory-service-order-requested');
    const orderCancelledSubscription = pubsub.subscription('inventory-service-order-cancelled');
    
    orderRequestedSubscription.on('message', async (message) => {
      try {
        // Check if message is already processed
        if (await isMessageProcessed(message.id)) {
          console.log('Message already processed, skipping:', message.id);
          message.ack();
          return;
        }

        const data = JSON.parse(message.data.toString()) as OrderRequestedEvent;
        console.log('Received order requested event:', data);
        
        // Check inventory for each item
        const inventoryChecks = await Promise.all(
          data.items.map(async (item) => {
            const result = await pool.query(
              'SELECT quantity FROM inventory WHERE product_sku = $1',
              [item.product_sku]
            );
            const available = result.rows[0]?.quantity || 0;
            return {
              product_sku: item.product_sku,
              requested: item.quantity,
              available,
              sufficient: available >= item.quantity
            };
          })
        );

        const allSufficient = inventoryChecks.every(check => check.sufficient);
        const details = inventoryChecks.map(check => ({
          product_sku: check.product_sku,
          requested: check.requested,
          available: check.available
        }));

        // Publish inventory status event
        const inventoryStatusEvent: InventoryStatusEvent = {
          cart_id: data.cart_id,
          customer_id: data.customer_id,
          status: allSufficient ? 'sufficient' : 'insufficient',
          details
        };

        await inventoryStatusTopic.publishMessage({
          data: Buffer.from(JSON.stringify(inventoryStatusEvent))
        });

        if (allSufficient) {
          // Publish stock available event
          const stockAvailableEvent: StockAvailableEvent = {
            cart_id: data.cart_id,
            customer_id: data.customer_id,
            items: details.map(detail => ({
              product_sku: detail.product_sku,
              quantity: detail.requested,
              available: detail.available
            }))
          };

          await stockAvailableTopic.publishMessage({
            data: Buffer.from(JSON.stringify(stockAvailableEvent))
          });
        } else {
          // Publish stock rejected event
          const stockRejectedEvent: StockRejectedEvent = {
            cart_id: data.cart_id,
            customer_id: data.customer_id,
            reason: 'insufficient_stock',
            details
          };

          await stockRejectedTopic.publishMessage({
            data: Buffer.from(JSON.stringify(stockRejectedEvent))
          });
        }

        // Mark message as processed on success
        await markMessageProcessed(message.id, 'order-requested', 'success');
        message.ack();
      } catch (error) {
        console.error('Error processing order requested event:', error);
        // Mark message as failed
        await markMessageProcessed(
          message.id, 
          'order-requested', 
          'failed', 
          error instanceof Error ? error.message : 'Unknown error'
        );
        message.nack();
      }
    });

    orderCancelledSubscription.on('message', async (message) => {
      try {
        // Check if message is already processed
        if (await isMessageProcessed(message.id)) {
          console.log('Message already processed, skipping:', message.id);
          message.ack();
          return;
        }

        const data = JSON.parse(message.data.toString()) as OrderCancelledEvent;
        console.log('Received order cancelled event:', data);
        
        // Return items to inventory
        for (const item of data.items) {
          await pool.query(
            `UPDATE inventory 
             SET quantity = quantity + $1,
                 last_updated = CURRENT_TIMESTAMP
             WHERE product_sku = $2`,
            [item.quantity, item.product_sku]
          );
          console.log(`Returned ${item.quantity} units of ${item.product_sku} to inventory`);
        }

        // Mark message as processed on success
        await markMessageProcessed(message.id, 'order-cancelled', 'success');
        message.ack();
      } catch (error) {
        console.error('Error processing order cancelled event:', error);
        // Mark message as failed
        await markMessageProcessed(
          message.id, 
          'order-cancelled', 
          'failed', 
          error instanceof Error ? error.message : 'Unknown error'
        );
        message.nack();
      }
    });

    console.log('Inventory service subscribed to topics successfully');
  } catch (error) {
    console.error('Error setting up PubSub subscriptions:', error);
  }
}

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'inventory-service',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Get inventory status for all products
app.get('/inventory', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*, p.name as product_name, p.price
      FROM inventory i
      JOIN products p ON i.product_sku = p.sku
      ORDER BY i.last_updated DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get inventory status for a specific product
app.get('/inventory/:sku', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*, p.name as product_name, p.price
      FROM inventory i
      JOIN products p ON i.product_sku = p.sku
      WHERE i.product_sku = $1
    `, [req.params.sku]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found in inventory' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Update inventory quantity
app.put('/inventory/:sku', async (req, res) => {
  const { quantity } = req.body;
  try {
    const result = await pool.query(
      'UPDATE inventory SET quantity = $1, last_updated = CURRENT_TIMESTAMP WHERE product_sku = $2 RETURNING *',
      [quantity, req.params.sku]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found in inventory' });
    }

    // Check if inventory is low
    const inventory = result.rows[0];
    if (inventory.quantity <= inventory.min_quantity) {
      // Publish low inventory event
      await pubsub.topic('inventory.status.updated').publishMessage({
        data: Buffer.from(JSON.stringify({
          product_sku: inventory.product_sku,
          quantity: inventory.quantity,
          status: 'low_stock'
        }))
      });
    }

    res.json(inventory);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Start the server
app.listen(port, async () => {
  try {
    await initializeDatabase();
    await subscribeToTopics();
    console.log(`Inventory service listening at http://localhost:${port}`);
  } catch (error) {
    console.error('Failed to start inventory service:', error);
    process.exit(1);
  }
}); 