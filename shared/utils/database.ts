import { DataSource } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Inventory } from '../entities/inventory.entity';
import { Notification } from '../entities/notification.entity';
import { logger } from './logger';

export class Database {
  private static dataSource: DataSource;

  public static async initialize(): Promise<void> {
    try {
      this.dataSource = new DataSource({
        type: 'postgres',
        url: process.env.POSTGRES_URL,
        entities: [Order, OrderItem, Inventory, Notification],
        synchronize: true, // Set to false in production
        logging: process.env.NODE_ENV === 'development',
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });

      await this.dataSource.initialize();
      logger.info('Database connection established');

      // Create initial data if needed
      await this.createInitialData();
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private static async createInitialData(): Promise<void> {
    try {
      const inventoryRepository = this.dataSource.getRepository(Inventory);
      
      // Check if we have any inventory items
      const count = await inventoryRepository.count();
      
      if (count === 0) {
        // Create some initial inventory items
        const initialInventory = [
          {
            product_id: '1',
            quantity: 100,
            status: 'IN_STOCK'
          },
          {
            product_id: '2',
            quantity: 50,
            status: 'IN_STOCK'
          },
          {
            product_id: '3',
            quantity: 10,
            status: 'LOW_STOCK'
          }
        ];

        await inventoryRepository.save(initialInventory);
        logger.info('Initial inventory data created');
      }
    } catch (error) {
      logger.error('Failed to create initial data:', error);
      throw error;
    }
  }

  public static getDataSource(): DataSource {
    if (!this.dataSource) {
      throw new Error('Database not initialized');
    }
    return this.dataSource;
  }

  public static async close(): Promise<void> {
    if (this.dataSource) {
      await this.dataSource.destroy();
      logger.info('Database connection closed');
    }
  }
} 