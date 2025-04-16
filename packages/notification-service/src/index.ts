const express = require('express');
const { Pool } = require('pg');
const { PubSub } = require('@google-cloud/pubsub');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.NODE_ENV === 'production' ? process.env.PORT || 8080 : process.env.NOTIFICATION_PORT || 3002;

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
const orderCreatedTopic = pubsub.topic('order.created');
const orderCancelledTopic = pubsub.topic('order.cancelled');
const stockRejectedTopic = pubsub.topic('stock.rejected');

// Define interfaces
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

// Initialize database
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        recipient VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        channel VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient);
      CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
    `);

    console.log('Notifications database initialized successfully');
  } catch (error) {
    console.error('Error initializing notifications database:', error);
    process.exit(1);
  }
}

// Subscribe to events
async function subscribeToEvents() {
  const orderCreatedSubscription = orderCreatedTopic.subscription('notification-service-order-created');
  const orderCancelledSubscription = orderCancelledTopic.subscription('notification-service-order-cancelled');
  const stockRejectedSubscription = stockRejectedTopic.subscription('notification-service-stock-rejected');

  orderCreatedSubscription.on('message', async (message) => {
    try {
      const order = JSON.parse(message.data.toString()) as OrderCreatedEvent;
      console.log('Processing order created notification:', order);

      // Store email notification
      await pool.query(
        'INSERT INTO notifications (recipient, message, channel, status) VALUES ($1, $2, $3, $4)',
        [
          order.customer_id,
          `Your order #${order.order_id} has been created successfully`,
          'email',
          'pending'
        ]
      );

      // Store push notification
      await pool.query(
        'INSERT INTO notifications (recipient, message, channel, status) VALUES ($1, $2, $3, $4)',
        [
          order.customer_id,
          `Your order #${order.order_id} has been created successfully`,
          'push',
          'pending'
        ]
      );

      message.ack();
    } catch (error) {
      console.error('Error processing order created notification:', error);
      message.nack();
    }
  });

  orderCancelledSubscription.on('message', async (message) => {
    try {
      const order = JSON.parse(message.data.toString()) as OrderCancelledEvent;
      console.log('Processing order cancelled notification:', order);

      // Store email notification
      await pool.query(
        'INSERT INTO notifications (recipient, message, channel, status) VALUES ($1, $2, $3, $4)',
        [
          order.customer_id,
          `Your order #${order.order_id} has been cancelled. Reason: ${order.reason}`,
          'email',
          'pending'
        ]
      );

      // Store push notification
      await pool.query(
        'INSERT INTO notifications (recipient, message, channel, status) VALUES ($1, $2, $3, $4)',
        [
          order.customer_id,
          `Your order #${order.order_id} has been cancelled. Reason: ${order.reason}`,
          'push',
          'pending'
        ]
      );

      message.ack();
    } catch (error) {
      console.error('Error processing order cancelled notification:', error);
      message.nack();
    }
  });

  stockRejectedSubscription.on('message', async (message) => {
    try {
      const data = JSON.parse(message.data.toString()) as StockRejectedEvent;
      console.log('Processing stock rejected notification:', data);

      const productDetails = data.details.map(d => 
        `Product ${d.product_sku}: Requested ${d.requested}, Available ${d.available}`
      ).join('\n');

      // Store email notification
      await pool.query(
        'INSERT INTO notifications (recipient, message, channel, status) VALUES ($1, $2, $3, $4)',
        [
          data.customer_id,
          `Some items in your cart are out of stock:\n${productDetails}`,
          'email',
          'pending'
        ]
      );

      // Store push notification
      await pool.query(
        'INSERT INTO notifications (recipient, message, channel, status) VALUES ($1, $2, $3, $4)',
        [
          data.customer_id,
          'Some items in your cart are out of stock. Please check your cart for details.',
          'push',
          'pending'
        ]
      );

      message.ack();
    } catch (error) {
      console.error('Error processing stock rejected notification:', error);
      message.nack();
    }
  });
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'notification-service',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Start the server
app.listen(port, async () => {
  await initializeDatabase();
  await subscribeToEvents();
  console.log(`Notification service listening at http://localhost:${port}`);
}); 