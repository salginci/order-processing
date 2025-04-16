export enum EventType {
  ORDER_CREATED = 'order.created',
  ORDER_CANCELLED = 'order.cancelled',
  INVENTORY_UPDATED = 'inventory.status.updated',
  NOTIFICATION_SENT = 'notification.sent'
}

export interface BaseEvent {
  id: string;
  type: EventType;
  timestamp: Date;
  version: string;
  metadata?: Record<string, unknown>;
  attributes?: Record<string, string>;
}

export interface OrderCreatedEvent extends BaseEvent {
  type: EventType.ORDER_CREATED;
  data: {
    orderId: string;
    customerId: string;
    items: Array<{
      productId: string;
      quantity: number;
      price: number;
    }>;
    totalAmount: number;
  };
}

export interface OrderCancelledEvent extends BaseEvent {
  type: EventType.ORDER_CANCELLED;
  data: {
    orderId: string;
    reason: string;
  };
}

export interface InventoryUpdatedEvent extends BaseEvent {
  type: EventType.INVENTORY_UPDATED;
  data: {
    productId: string;
    quantity: number;
    status: 'IN_STOCK' | 'OUT_OF_STOCK' | 'LOW_STOCK';
  };
}

export interface NotificationSentEvent extends BaseEvent {
  type: EventType.NOTIFICATION_SENT;
  data: {
    recipient: string;
    message: string;
    channel: 'EMAIL' | 'SMS' | 'PUSH';
  };
}

export type Event = 
  | OrderCreatedEvent 
  | OrderCancelledEvent 
  | InventoryUpdatedEvent 
  | NotificationSentEvent; 