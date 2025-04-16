import express from 'express';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME
});

const port = process.env.NODE_ENV === 'production' ? process.env.PORT || 8080 : process.env.PRODUCT_PORT || 3003;

// Initialize database
async function checkTableExists() {
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

async function checkIndexExists() {
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND tablename = 'products' 
        AND indexname = 'idx_products_sku'
      );
    `);
    return result.rows[0].exists;
  } catch (error) {
    return false;
  }
}

async function initializeDatabase() {
  try {
    // Create products table if it doesn't exist
    if (!(await checkTableExists())) {
      console.log('Creating products table...');
      await pool.query(`
        CREATE TABLE products (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          price DECIMAL(10,2) NOT NULL,
          sku VARCHAR(50) UNIQUE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('Products table created');
    } else {
      console.log('Products table already exists');
    }

    // Create index if it doesn't exist
    if (!(await checkIndexExists())) {
      console.log('Creating products index...');
      await pool.query(`
        CREATE INDEX idx_products_sku ON products(sku)
      `);
      console.log('Products index created');
    } else {
      console.log('Products index already exists');
    }

    // Check if we have any products
    const result = await pool.query('SELECT COUNT(*) FROM products');
    if (result.rows[0].count === '0') {
      console.log('Inserting sample products...');
      await pool.query(`
        INSERT INTO products (name, description, price, sku) VALUES
        ('Laptop', 'High-performance laptop with 16GB RAM', 999.99, 'LAP-001'),
        ('Smartphone', 'Latest smartphone with 5G capability', 699.99, 'PHN-001'),
        ('Headphones', 'Wireless noise-cancelling headphones', 199.99, 'HPH-001'),
        ('Smart Watch', 'Fitness tracking smart watch', 249.99, 'WCH-001'),
        ('Tablet', '10-inch tablet with stylus support', 449.99, 'TAB-001')
      `);
      console.log('Sample products inserted');
    } else {
      console.log('Products already exist');
    }

    console.log('Product database initialized successfully');
  } catch (error) {
    console.error('Error initializing product database:', error);
    process.exit(1);
  }
}

// Health check endpoint
app.get('/', (req: express.Request, res: express.Response) => {
  res.json({
    status: 'healthy',
    service: 'product-service',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Get all products
app.get('/products', async (req: express.Request, res: express.Response) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get product by SKU
app.get('/products/:sku', async (req: express.Request, res: express.Response) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE sku = $1', [req.params.sku]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Create product
app.post('/products', async (req: express.Request, res: express.Response) => {
  const { name, description, price, sku } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO products (name, description, price, sku) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description, price, sku]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Update product
app.put('/products/:sku', async (req: express.Request, res: express.Response) => {
  const { name, description, price } = req.body;
  try {
    const result = await pool.query(
      'UPDATE products SET name = $1, description = $2, price = $3, updated_at = CURRENT_TIMESTAMP WHERE sku = $4 RETURNING *',
      [name, description, price, req.params.sku]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Delete product
app.delete('/products/:sku', async (req: express.Request, res: express.Response) => {
  try {
    const result = await pool.query('DELETE FROM products WHERE sku = $1 RETURNING *', [req.params.sku]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

initializeDatabase().then(() => {
  app.listen(port, () => {
    console.log(`Product service listening at http://localhost:${port}`);
  });
}); 