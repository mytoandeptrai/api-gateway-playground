import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { KafkaConsumer } from '@/shared/kafka/utils/kafka.consumer';
import { KafkaAdmin } from '@/shared/kafka/utils/kafka.admin';
import { DlqService } from '@/shared/dlq/dlq.service';
import { OrderSagaService } from './order-saga.service';

const GROUP_ID = 'orchestrator-group';

const TOPICS = [
  'order.created',
  'inventory.stock_reserved',
  'inventory.stock_insufficient',
  'inventory.stock_released',
  'payment.completed',
  'payment.failed',
  'payment.timeout',
  'payment.refunded',
  'inventory.stock_confirmed',
  'shipping.label_created',
  'shipping.status_updated',
  'shipping.delivered',
  'refund.requested',
  'refund.validated',
] as const;

@Injectable()
export class SagaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SagaConsumerService.name);

  // All topics used across the system — created here so services can start in any order
  private static readonly ALL_TOPICS = [
    'order.created',
    'order.cancel',
    'order.cancelled',
    'order.status_updated',
    'inventory.reserve_stock',
    'inventory.stock_reserved',
    'inventory.stock_insufficient',
    'inventory.confirm_stock',
    'inventory.stock_confirmed',
    'inventory.release_stock',
    'inventory.stock_released',
    'payment.completed',
    'payment.failed',
    'payment.timeout',
    'payment.refund_requested',
    'payment.refunded',
    'shipping.create_label',
    'shipping.label_created',
    'shipping.status_updated',
    'shipping.delivered',
    'notification.send',
    'refund.requested',
    'refund.validated',
    'refund.status_updated',
  ];

  constructor(
    private readonly kafkaConsumer: KafkaConsumer,
    private readonly kafkaAdmin: KafkaAdmin,
    private readonly orderSagaService: OrderSagaService,
    private readonly dlqService: DlqService,
  ) {}

  async onModuleInit() {
    await this.kafkaAdmin.ensureTopics(SagaConsumerService.ALL_TOPICS);
    this.logger.log('All Kafka topics ensured');

    this.logger.log(`[KAFKA] Subscribing to topics: ${TOPICS.join(', ')}`);
    const key = await this.kafkaConsumer.subscribe({
      topics: [...TOPICS],
      groupId: GROUP_ID,
      fromBeginning: false,
    });
    this.logger.log(`[KAFKA] ✓ Subscribed to all orchestrator topics`);

    await this.kafkaConsumer.run(key, async (message) => {
      if (!message.value) return;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(message.value);
      } catch {
        this.logger.error(`[KAFKA] Invalid JSON on ${message.topic}`);
        return;
      }

      this.logger.log(
        `[KAFKA] Received ${message.topic}: ${JSON.stringify(event).slice(0, 100)}`,
      );

      await this.dlqService.withRetry(
        message.topic,
        event,
        () => this.route(message.topic, event),
      );
    });
    this.logger.log('Saga consumers initialized');
  }

  async onModuleDestroy() {
    await this.kafkaConsumer.disconnect();
  }

  private async route(topic: string, event: ReturnType<typeof JSON.parse>) {
    switch (topic) {
      case 'order.created':
        return this.orderSagaService.startSaga(event);
      case 'inventory.stock_reserved':
        return this.orderSagaService.onInventoryReserved(event);
      case 'inventory.stock_insufficient':
        return this.orderSagaService.onInventoryInsufficient(event);
      case 'inventory.stock_released':
        return this.orderSagaService.onStockReleased(event);
      case 'payment.completed':
        return this.orderSagaService.onPaymentCompleted(event);
      case 'payment.failed':
        return this.orderSagaService.onPaymentFailed(event);
      case 'payment.timeout':
        return this.orderSagaService.onPaymentTimeout(event);
      case 'payment.refunded':
        return this.orderSagaService.onPaymentRefunded(event);
      case 'refund.requested':
        return this.orderSagaService.onRefundRequested(event);
      case 'refund.validated':
        return this.orderSagaService.onRefundValidated(event);
      case 'inventory.stock_confirmed':
        return this.orderSagaService.onInventoryConfirmed(event);
      case 'shipping.label_created':
        return this.orderSagaService.onShippingLabelCreated(event);
      case 'shipping.status_updated':
        return this.orderSagaService.onShippingStatusUpdated(event);
      case 'shipping.delivered':
        return this.orderSagaService.onShippingDelivered(event);
    }
  }
}
