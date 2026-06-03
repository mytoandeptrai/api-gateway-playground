import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { KafkaConsumer } from '@/shared/kafka/utils/kafka.consumer';
import { RefundService } from './refund.service';

const GROUP_ID = 'refund-group';

@Injectable()
export class RefundConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RefundConsumerService.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumer,
    private readonly refundService: RefundService,
  ) {}

  async onModuleInit() {
    const key = await this.kafkaConsumer.subscribe({
      topics: ['refund.requested', 'refund.status_updated'],
      groupId: GROUP_ID,
      fromBeginning: false,
    });

    await this.kafkaConsumer.run(key, async (message) => {
      if (!message.value) return;
      try {
        const event = JSON.parse(message.value);
        this.logger.log(`[KAFKA] Received ${message.topic}`);

        if (message.topic === 'refund.requested') {
          const refundId = event.payload?.refundId as string;
          if (refundId) await this.refundService.validateAndEmit(refundId);
        } else if (message.topic === 'refund.status_updated') {
          await this.refundService.updateStatus(event.payload);
        }
      } catch (err) {
        this.logger.error(`Error processing ${message.topic}: ${err}`);
      }
    });

    this.logger.log('Refund consumer initialized');
  }

  async onModuleDestroy() {
    await this.kafkaConsumer.disconnect();
  }
}
