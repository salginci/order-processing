import { Channel, Connection, connect } from 'amqplib';
import { Event } from '../types/events';
import { RABBITMQ_CONFIG } from '../config/rabbitmq';
import { logger } from './logger';

export class RabbitMQClient {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private static instance: RabbitMQClient;

  private constructor() {}

  public static getInstance(): RabbitMQClient {
    if (!RabbitMQClient.instance) {
      RabbitMQClient.instance = new RabbitMQClient();
    }
    return RabbitMQClient.instance;
  }

  public async connect(): Promise<void> {
    try {
      this.connection = await connect(RABBITMQ_CONFIG.url);
      this.channel = await this.connection.createChannel();
      
      // Assert exchange
      await this.channel.assertExchange(
        RABBITMQ_CONFIG.exchange.name,
        RABBITMQ_CONFIG.exchange.type,
        RABBITMQ_CONFIG.exchange.options
      );

      // Assert DLQ exchange
      await this.channel.assertExchange(
        RABBITMQ_CONFIG.dlq.exchange.name,
        RABBITMQ_CONFIG.dlq.exchange.type,
        RABBITMQ_CONFIG.dlq.exchange.options
      );

      logger.info('RabbitMQ connection established');
    } catch (error) {
      logger.error('Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  public async publish(event: Event): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    try {
      const queueConfig = RABBITMQ_CONFIG.queues[event.type];
      await this.channel.assertQueue(queueConfig.name, queueConfig.options);
      
      await this.channel.publish(
        RABBITMQ_CONFIG.exchange.name,
        event.type,
        Buffer.from(JSON.stringify(event)),
        { persistent: true }
      );

      logger.info(`Event published: ${event.type}`, { eventId: event.id });
    } catch (error) {
      logger.error('Failed to publish event:', error);
      throw error;
    }
  }

  public async consume(
    eventType: string,
    handler: (event: Event) => Promise<void>
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    try {
      const queueConfig = RABBITMQ_CONFIG.queues[eventType];
      await this.channel.assertQueue(queueConfig.name, queueConfig.options);

      await this.channel.consume(queueConfig.name, async (message) => {
        if (!message) return;

        try {
          const event = JSON.parse(message.content.toString()) as Event;
          await handler(event);
          this.channel?.ack(message);
        } catch (error) {
          logger.error('Error processing message:', error);
          this.channel?.nack(message, false, false);
        }
      });

      logger.info(`Started consuming events: ${eventType}`);
    } catch (error) {
      logger.error('Failed to consume events:', error);
      throw error;
    }
  }

  public async close(): Promise<void> {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
    logger.info('RabbitMQ connection closed');
  }
} 