export const PUBSUB_CONFIG = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'your-project-id',
  topics: {
    [EventType.ORDER_CREATED]: 'order-created',
    [EventType.ORDER_CANCELLED]: 'order-cancelled',
    [EventType.INVENTORY_UPDATED]: 'inventory-updated',
    [EventType.NOTIFICATION_SENT]: 'notification-sent'
  },
  subscriptions: {
    [EventType.ORDER_CREATED]: {
      name: 'order-created-sub',
      deadLetterPolicy: {
        deadLetterTopic: 'order-created-dlq',
        maxDeliveryAttempts: 5
      }
    },
    [EventType.ORDER_CANCELLED]: {
      name: 'order-cancelled-sub',
      deadLetterPolicy: {
        deadLetterTopic: 'order-cancelled-dlq',
        maxDeliveryAttempts: 5
      }
    },
    [EventType.INVENTORY_UPDATED]: {
      name: 'inventory-updated-sub',
      deadLetterPolicy: {
        deadLetterTopic: 'inventory-updated-dlq',
        maxDeliveryAttempts: 5
      }
    },
    [EventType.NOTIFICATION_SENT]: {
      name: 'notification-sent-sub',
      deadLetterPolicy: {
        deadLetterTopic: 'notification-sent-dlq',
        maxDeliveryAttempts: 5
      }
    }
  },
  retry: {
    maxAttempts: 5,
    initialRetryDelayMillis: 1000,
    retryDelayMultiplier: 2,
    maxRetryDelayMillis: 60000
  }
}; 