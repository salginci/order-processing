import express from 'express';
import { Pool } from 'pg';
import { PubSub } from '@google-cloud/pubsub';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.NODE_ENV === 'production' ? process.env.PORT || 8080 : process.env.CUSTOMER_PORT || 3006;

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

// Define interfaces
interface Customer {
  id: string;
  name: string;
  email: string;
  created_at: Date;
  updated_at: Date;
}

// Create tables if they don't exist
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database tables initialized successfully');

    // Check if we have any customers
    const result = await client.query('SELECT COUNT(*) FROM customers');
    if (result.rows[0].count === '0') {
      // Insert sample customers with predefined UUIDs
      await client.query(`
        INSERT INTO customers (id, name, email) VALUES
          ('550e8400-e29b-41d4-a716-446655440000', 'John Smith', 'john.smith@example.com'),
          ('550e8400-e29b-41d4-a716-446655440001', 'Jane Doe', 'jane.doe@example.com'),
          ('550e8400-e29b-41d4-a716-446655440002', 'Robert Johnson', 'robert.johnson@example.com'),
          ('550e8400-e29b-41d4-a716-446655440003', 'Emily Davis', 'emily.davis@example.com'),
          ('550e8400-e29b-41d4-a716-446655440004', 'Michael Wilson', 'michael.wilson@example.com')
      `);
      console.log('Sample customers created successfully');
    }
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
  res.json({ status: 'ok', service: 'customer-service' });
});

// Get all customers
app.get('/customers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create customer
app.post('/customers', async (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      'INSERT INTO customers (name, email) VALUES ($1, $2) RETURNING *',
      [name, email]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if ((error as any).code === '23505') { // Unique violation
      res.status(409).json({ error: 'Email already exists' });
    } else {
      console.error('Error creating customer:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } finally {
    client.release();
  }
});

// Get customer by ID
app.get('/customers/:id', async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM customers WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting customer:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Update customer
app.put('/customers/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      'UPDATE customers SET name = $1, email = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [name, email, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if ((error as any).code === '23505') { // Unique violation
      res.status(409).json({ error: 'Email already exists' });
    } else {
      console.error('Error updating customer:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } finally {
    client.release();
  }
});

// Delete customer
app.delete('/customers/:id', async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    const result = await client.query('DELETE FROM customers WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Start the server
app.listen(port, async () => {
  try {
    await initializeDatabase();
    console.log(`Customer service listening at http://localhost:${port}`);
  } catch (error) {
    console.error('Failed to start customer service:', error);
    process.exit(1);
  }
}); 