import express from 'express';
import { Pool } from 'pg';
import { PubSub } from '@google-cloud/pubsub';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const port = process.env.PUSH_PORT || 3007;

// Create PostgreSQL connection pool
const pool = new Pool({
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DATABASE
});

// Initialize PubSub
const pubsub = new PubSub();

// Define topics
const orderCreatedTopic = pubsub.topic('order.created');
const orderCancelledTopic = pubsub.topic('order.cancelled');
const stockRejectedTopic = pubsub.topic('stock.rejected');

// Define interfaces
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

interface OrderCancelledEvent {
  order_id: string;
  customer_id: string;
  reason: string;
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

// Initialize database
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_notifications (
        id SERIAL PRIMARY KEY,
        customer_id VARCHAR(255) NOT NULL,
        device_token VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        status VARCHAR(50) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_push_notifications_customer_id ON push_notifications(customer_id);
      CREATE INDEX IF NOT EXISTS idx_push_notifications_status ON push_notifications(status);
    `);

    console.log('Push notifications database initialized successfully');
  } catch (error) {
    console.error('Error initializing push notifications database:', error);
    process.exit(1);
  }
}

// Simulate sending push notification
async function simulatePushNotification(customerId: string, title: string, body: string) {
  // In a real implementation, this would use a push notification service
  // For now, we'll just log the notification and store it in the database
  console.log('Simulating push notification:', { customerId, title, body });

  try {
    await pool.query(
      `INSERT INTO push_notifications (customer_id, device_token, title, body, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [customerId, 'simulated-device-token', title, body, 'sent']
    );
  } catch (error) {
    console.error('Error storing push notification:', error);
  }
}

// Subscribe to topics
async function subscribeToTopics() {
  try {
    const orderCreatedSubscription = pubsub.subscription('push-service-order-created');
    const orderCancelledSubscription = pubsub.subscription('push-service-order-cancelled');
    const stockRejectedSubscription = pubsub.subscription('push-service-stock-rejected');

    orderCreatedSubscription.on('message', async (message) => {
      try {
        const data = JSON.parse(message.data.toString()) as OrderCreatedEvent;
        console.log('Received order created event:', data);

        await simulatePushNotification(
          data.customer_id,
          'Order Confirmed',
          `Your order #${data.order_id} has been confirmed. We'll notify you when it's ready.`
        );

        message.ack();
      } catch (error) {
        console.error('Error processing order created event:', error);
        message.nack();
      }
    });

    orderCancelledSubscription.on('message', async (message) => {
      try {
        const data = JSON.parse(message.data.toString()) as OrderCancelledEvent;
        console.log('Received order cancelled event:', data);

        await simulatePushNotification(
          data.customer_id,
          'Order Cancelled',
          `Your order #${data.order_id} has been cancelled. Reason: ${data.reason}`
        );

        message.ack();
      } catch (error) {
        console.error('Error processing order cancelled event:', error);
        message.nack();
      }
    });

    stockRejectedSubscription.on('message', async (message) => {
      try {
        const data = JSON.parse(message.data.toString()) as StockRejectedEvent;
        console.log('Received stock rejected event:', data);

        await simulatePushNotification(
          data.customer_id,
          'Stock Unavailable',
          'Some items in your cart are out of stock. Please check your cart for details.'
        );

        message.ack();
      } catch (error) {
        console.error('Error processing stock rejected event:', error);
        message.nack();
      }
    });

    console.log('Push service subscribed to topics successfully');
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
    service: 'push-service',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Get push notifications for a customer
app.get('/notifications/:customerId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM push_notifications WHERE customer_id = $1 ORDER BY created_at DESC',
      [req.params.customerId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Start the server
app.listen(port, async () => {
  try {
    await initializeDatabase();
    await subscribeToTopics();
    console.log(`Push service listening at http://localhost:${port}`);
  } catch (error) {
    console.error('Failed to start push service:', error);
    process.exit(1);
  }
}); 