import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { KafkaConsumer } from '@/shared/kafka/utils/kafka.consumer';
import { NotificationService } from './notification.service';

const GROUP_ID = 'notification-group';

@Injectable()
export class NotificationConsumerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationConsumerService.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumer,
    private readonly notificationService: NotificationService,
  ) {}

  async onModuleInit() {
    const key = await this.kafkaConsumer.subscribe({
      topic: 'notification.send',
      groupId: GROUP_ID,
      fromBeginning: false,
    });

    await this.kafkaConsumer.run(key, async (message) => {
      this.logger.log(`[KAFKA] Received message`);
      if (!message.value) return;
      try {
        const event = JSON.parse(message.value);
        await this.notificationService.send({
          eventId: event.eventId,
          sagaId: event.sagaId,
          orderId: event.orderId,
          userId: event.userId,
          payload: event.payload,
        });
      } catch (err) {
        this.logger.error(
          `[KAFKA] ✗ Error processing notification.send: ${err}`,
        );
      }
    });

    this.logger.log('Notification consumer initialized');
  }

  async onModuleDestroy() {
    await this.kafkaConsumer.disconnect();
  }
}
