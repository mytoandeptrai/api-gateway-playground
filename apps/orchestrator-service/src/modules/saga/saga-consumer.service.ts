import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { KafkaConsumer } from '@/shared/kafka/utils/kafka.consumer';
import { OrderSagaService } from './order-saga.service';

const GROUP_ID = 'orchestrator-group';

const TOPICS = [
  'order.created',
  'inventory.stock_reserved',
  'inventory.stock_insufficient',
  'inventory.stock_released',
  'payment.completed',
  'payment.timeout',
  'inventory.stock_confirmed',
  'shipping.label_created',
  'shipping.delivered',
] as const;

@Injectable()
export class SagaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SagaConsumerService.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumer,
    private readonly orderSagaService: OrderSagaService,
  ) {}

  async onModuleInit() {
    for (const topic of TOPICS) {
      const key = await this.kafkaConsumer.subscribe({
        topic,
        groupId: GROUP_ID,
        fromBeginning: false,
      });
      await this.kafkaConsumer.run(key, async (message) => {
        if (!message.value) return;
        try {
          const event = JSON.parse(message.value);
          await this.route(topic, event);
        } catch (err) {
          this.logger.error(`Error processing ${topic}: ${err}`);
        }
      });
    }
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
      case 'payment.timeout':
        return this.orderSagaService.onPaymentTimeout(event);
      case 'inventory.stock_confirmed':
        return this.orderSagaService.onInventoryConfirmed(event);
      case 'shipping.label_created':
        return this.orderSagaService.onShippingLabelCreated(event);
      case 'shipping.delivered':
        return this.orderSagaService.onShippingDelivered(event);
    }
  }
}
