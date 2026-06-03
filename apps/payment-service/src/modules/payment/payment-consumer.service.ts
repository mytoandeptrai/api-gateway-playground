import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { KafkaConsumer } from '@/shared/kafka/utils/kafka.consumer';
import { PaymentService } from './payment.service';

const GROUP_ID = 'payment-command-group';

@Injectable()
export class PaymentConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentConsumerService.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumer,
    private readonly paymentService: PaymentService,
  ) {}

  async onModuleInit() {
    const key = await this.kafkaConsumer.subscribe({
      topics: ['payment.refund_requested'],
      groupId: GROUP_ID,
      fromBeginning: false,
    });

    await this.kafkaConsumer.run(key, async (message) => {
      if (!message.value) return;
      try {
        const event = JSON.parse(message.value);
        this.logger.log(`[KAFKA] Received ${message.topic}`);

        if (message.topic === 'payment.refund_requested') {
          const { orderId, amount, reason } = event.payload as {
            orderId: string;
            amount: number;
            reason: string;
          };
          await this.paymentService.processRefund({ orderId, amount, reason });
        }
      } catch (err) {
        this.logger.error(`Error processing ${message.topic}: ${err}`);
      }
    });

    this.logger.log('Payment command consumer initialized');
  }

  async onModuleDestroy() {
    await this.kafkaConsumer.disconnect();
  }
}
