import { PubSub, Topic, Subscription } from '@google-cloud/pubsub';
import { Event } from '../types/events';
import { PUBSUB_CONFIG } from '../config/pubsub';
import { logger } from './logger';

export class PubSubClient {
  private pubsub: PubSub;
  private topics: Map<string, Topic> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private static instance: PubSubClient;

  private constructor() {
    this.pubsub = new PubSub({
      projectId: PUBSUB_CONFIG.projectId
    });
  }

  public static getInstance(): PubSubClient {
    if (!PubSubClient.instance) {
      PubSubClient.instance = new PubSubClient();
    }
    return PubSubClient.instance;
  }

  public async initialize(): Promise<void> {
    try {
      // Create or get topics
      for (const [eventType, topicName] of Object.entries(PUBSUB_CONFIG.topics)) {
        const [topic] = await this.pubsub.createTopic(topicName).catch(() => 
          this.pubsub.topic(topicName)
        );
        this.topics.set(eventType, topic);

        // Create or get subscriptions
        const subConfig = PUBSUB_CONFIG.subscriptions[eventType];
        const [subscription] = await topic
          .createSubscription(subConfig.name, {
            deadLetterPolicy: subConfig.deadLetterPolicy
          })
          .catch(() => topic.subscription(subConfig.name));
        
        this.subscriptions.set(eventType, subscription);
      }

      logger.info('Pub/Sub initialization completed');
    } catch (error) {
      logger.error('Failed to initialize Pub/Sub:', error);
      throw error;
    }
  }

  public async publish(event: Event): Promise<void> {
    try {
      const topic = this.topics.get(event.type);
      if (!topic) {
        throw new Error(`Topic not found for event type: ${event.type}`);
      }

      const message = {
        data: Buffer.from(JSON.stringify(event)),
        attributes: {
          eventType: event.type,
          eventId: event.id,
          timestamp: event.timestamp.toISOString(),
          ...event.attributes
        }
      };

      await topic.publishMessage(message);
      logger.info(`Event published: ${event.type}`, { eventId: event.id });
    } catch (error) {
      logger.error('Failed to publish event:', error);
      throw error;
    }
  }

  public async subscribe(
    eventType: string,
    handler: (event: Event) => Promise<void>
  ): Promise<void> {
    try {
      const subscription = this.subscriptions.get(eventType);
      if (!subscription) {
        throw new Error(`Subscription not found for event type: ${eventType}`);
      }

      subscription.on('message', async (message) => {
        try {
          const event = JSON.parse(message.data.toString()) as Event;
          await handler(event);
          message.ack();
        } catch (error) {
          logger.error('Error processing message:', error);
          message.nack();
        }
      });

      subscription.on('error', (error) => {
        logger.error('Subscription error:', error);
      });

      logger.info(`Started consuming events: ${eventType}`);
    } catch (error) {
      logger.error('Failed to subscribe to events:', error);
      throw error;
    }
  }

  public async close(): Promise<void> {
    try {
      for (const subscription of this.subscriptions.values()) {
        await subscription.close();
      }
      logger.info('Pub/Sub connections closed');
    } catch (error) {
      logger.error('Error closing Pub/Sub connections:', error);
      throw error;
    }
  }
} 