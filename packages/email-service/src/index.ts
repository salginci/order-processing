import express from 'express';
import { PubSub } from '@google-cloud/pubsub';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.NODE_ENV === 'production' ? process.env.PORT || 8080 : process.env.EMAIL_PORT || 3004;

// Initialize PubSub
const pubsub = new PubSub();

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'email-service',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Email service listening at http://localhost:${port}`);
}); 