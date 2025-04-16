import { EventType } from '../types/events';

export const RABBITMQ_CONFIG = {
  url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
  exchange: {
    name: 'ecommerce',
    type: 'topic',
    options: {
      durable: true
    }
  },
  queues: {
    [EventType.ORDER_CREATED]: {
      name: 'order-created',
      options: {
        durable: true,
        deadLetterExchange: 'ecommerce-dlx',
        deadLetterRoutingKey: 'order-created-dlq'
      }
    },
    [EventType.ORDER_CANCELLED]: {
      name: 'order-cancelled',
      options: {
        durable: true,
        deadLetterExchange: 'ecommerce-dlx',
        deadLetterRoutingKey: 'order-cancelled-dlq'
      }
    },
    [EventType.INVENTORY_UPDATED]: {
      name: 'inventory-updated',
      options: {
        durable: true,
        deadLetterExchange: 'ecommerce-dlx',
        deadLetterRoutingKey: 'inventory-updated-dlq'
      }
    },
    [EventType.NOTIFICATION_SENT]: {
      name: 'notification-sent',
      options: {
        durable: true,
        deadLetterExchange: 'ecommerce-dlx',
        deadLetterRoutingKey: 'notification-sent-dlq'
      }
    }
  },
  retry: {
    maxAttempts: 3,
    delay: 1000, // ms
    backoff: true
  },
  dlq: {
    exchange: {
      name: 'ecommerce-dlx',
      type: 'topic',
      options: {
        durable: true
      }
    }
  }
}; 