import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { KafkaProducer } from './utils/kafka.producer';
import { KafkaConsumer } from './utils/kafka.consumer';

@Injectable()
export class KafkaPracticeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaPracticeService.name);
  private consumerKeys: string[] = [];

  constructor(
    private readonly kafkaProducer: KafkaProducer,
    private readonly kafkaConsumer: KafkaConsumer,
  ) {}

  async onModuleInit() {
    // Wait a bit for Kafka to be ready
    setTimeout(() => {
      this.setupKafkaDemo();
    }, 2000);
  }

  async onModuleDestroy() {
    // Cleanup consumers
    await this.kafkaConsumer.disconnect();
    await this.kafkaProducer.disconnect();
  }

  private async setupKafkaDemo() {
    try {
      this.logger.log('🚀 Setting up Kafka practice demo...');

      // Connect producer
      await this.kafkaProducer.connect();

      // Setup multiple consumers with different groupIds
      await this.setupConsumers();

      // Start sending test messages
      setTimeout(() => {
        this.startSendingTestMessages();
      }, 3000);

    } catch (error) {
      this.logger.error('❌ Failed to setup Kafka demo:', error);
    }
  }

  private async setupConsumers() {
    // 1. Email Service Consumer
    const emailConsumerKey = await this.kafkaConsumer.subscribe({
      topic: 'order-events',
      groupId: 'email-service',
      fromBeginning: false,
    });
    this.consumerKeys.push(emailConsumerKey);

    await this.kafkaConsumer.run(emailConsumerKey, async ({ key, value, topic, partition }) => {
      const message = JSON.parse(value || '{}');
      this.logger.log(`📧 [EMAIL SERVICE] Received order event:`, {
        orderId: message.orderId,
        event: message.event,
        topic,
        partition,
      });
      
      // Simulate email sending
      await this.simulateEmailSending(message);
    });

    // 2. SMS Service Consumer
    const smsConsumerKey = await this.kafkaConsumer.subscribe({
      topic: 'order-events',
      groupId: 'sms-service',
      fromBeginning: false,
    });
    this.consumerKeys.push(smsConsumerKey);

    await this.kafkaConsumer.run(smsConsumerKey, async ({ key, value, topic, partition }) => {
      const message = JSON.parse(value || '{}');
      this.logger.log(`📱 [SMS SERVICE] Received order event:`, {
        orderId: message.orderId,
        event: message.event,
        topic,
        partition,
      });
      
      // Simulate SMS sending
      await this.simulateSMSSending(message);
    });

    // 3. Analytics Service Consumer
    const analyticsConsumerKey = await this.kafkaConsumer.subscribe({
      topic: 'order-events',
      groupId: 'analytics-service',
      fromBeginning: false,
    });
    this.consumerKeys.push(analyticsConsumerKey);

    await this.kafkaConsumer.run(analyticsConsumerKey, async ({ key, value, topic, partition }) => {
      const message = JSON.parse(value || '{}');
      this.logger.log(`📊 [ANALYTICS SERVICE] Received order event:`, {
        orderId: message.orderId,
        event: message.event,
        topic,
        partition,
      });
      
      // Simulate analytics recording
      await this.simulateAnalyticsRecording(message);
    });

    // 4. Inventory Service Consumer
    const inventoryConsumerKey = await this.kafkaConsumer.subscribe({
      topic: 'order-events',
      groupId: 'inventory-service',
      fromBeginning: false,
    });
    this.consumerKeys.push(inventoryConsumerKey);

    await this.kafkaConsumer.run(inventoryConsumerKey, async ({ key, value, topic, partition }) => {
      const message = JSON.parse(value || '{}');
      this.logger.log(`📦 [INVENTORY SERVICE] Received order event:`, {
        orderId: message.orderId,
        event: message.event,
        topic,
        partition,
      });
      
      // Simulate inventory update
      await this.simulateInventoryUpdate(message);
    });

    this.logger.log('✅ All Kafka consumers set up successfully!');
    this.logger.log(`🔍 Active consumers: ${this.kafkaConsumer.getActiveConsumers().join(', ')}`);
  }

  private async startSendingTestMessages() {
    this.logger.log('🎯 Starting to send test order events...');

    // Simulate different order events
    const orderEvents = [
      {
        orderId: 'ORD-001',
        event: 'ORDER_CREATED',
        userId: 'user-123',
        total: 99.99,
        timestamp: new Date().toISOString(),
      },
      {
        orderId: 'ORD-002',
        event: 'ORDER_PAID',
        userId: 'user-456',
        total: 149.50,
        timestamp: new Date().toISOString(),
      },
      {
        orderId: 'ORD-003',
        event: 'ORDER_SHIPPED',
        userId: 'user-789',
        total: 75.25,
        timestamp: new Date().toISOString(),
      },
      {
        orderId: 'ORD-004',
        event: 'ORDER_DELIVERED',
        userId: 'user-321',
        total: 200.00,
        timestamp: new Date().toISOString(),
      },
    ];

    // Send events with intervals
    for (let i = 0; i < orderEvents.length; i++) {
      setTimeout(async () => {
        const event = orderEvents[i];
        this.logger.log(`📤 Sending order event: ${event.event} for ${event.orderId}`);
        
        await this.kafkaProducer.send({
          topic: 'order-events',
          messages: [{
            key: event.orderId,
            value: JSON.stringify(event),
          }],
        });
      }, i * 2000); // Send every 2 seconds
    }
  }

  // Simulate different service behaviors
  private async simulateEmailSending(message: any) {
    await this.delay(100); // Simulate processing time
    this.logger.log(`✉️ Email sent for order ${message.orderId} (${message.event})`);
  }

  private async simulateSMSSending(message: any) {
    await this.delay(50); // Simulate processing time
    this.logger.log(`📲 SMS sent for order ${message.orderId} (${message.event})`);
  }

  private async simulateAnalyticsRecording(message: any) {
    await this.delay(30); // Simulate processing time
    this.logger.log(`📈 Analytics recorded for order ${message.orderId} (${message.event})`);
  }

  private async simulateInventoryUpdate(message: any) {
    await this.delay(200); // Simulate processing time
    this.logger.log(`📋 Inventory updated for order ${message.orderId} (${message.event})`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Manual trigger methods for testing
  async triggerOrderCreated(orderId: string, userId: string, total: number) {
    const event = {
      orderId,
      event: 'ORDER_CREATED',
      userId,
      total,
      timestamp: new Date().toISOString(),
    };

    this.logger.log(`🎯 Manually triggering ORDER_CREATED event for ${orderId}`);
    await this.kafkaProducer.send({
      topic: 'order-events',
      messages: [{
        key: orderId,
        value: JSON.stringify(event),
      }],
    });
  }
}
