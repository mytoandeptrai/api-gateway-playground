import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { KafkaConsumer } from '@/shared/kafka/utils/kafka.consumer';
import { OrdersService } from './orders.service';
import { OrderStatus } from './entities/order.entity';

const GROUP_ID = 'order-group';

@Injectable()
export class OrderConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderConsumerService.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumer,
    private readonly ordersService: OrdersService,
  ) {}

  async onModuleInit() {
    const key = await this.kafkaConsumer.subscribe({
      topic: 'shipping.status_updated',
      groupId: GROUP_ID,
      fromBeginning: false,
    });

    await this.kafkaConsumer.run(key, async (message) => {
      if (!message.value) return;
      try {
        const event = JSON.parse(message.value);
        const { orderId, trackingId } = event.payload as {
          orderId: string;
          trackingId: string;
          status: string;
        };

        await this.ordersService.updateStatus(orderId, {
          status: OrderStatus.SHIPPED,
          trackingId,
        });
      } catch (err) {
        this.logger.error(`Error processing shipping.status_updated: ${err}`);
      }
    });

    this.logger.log('Order consumer initialized');
  }

  async onModuleDestroy() {
    await this.kafkaConsumer.disconnect();
  }
}
