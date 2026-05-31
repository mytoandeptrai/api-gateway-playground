import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { KafkaConsumer } from '@/shared/kafka/utils/kafka.consumer';
import { ShippingService } from './shipping.service';

@Injectable()
export class ShippingConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ShippingConsumerService.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumer,
    private readonly shippingService: ShippingService,
  ) {}

  async onModuleInit() {
    const key = await this.kafkaConsumer.subscribe({
      topic: 'shipping.create_label',
      groupId: 'shipping-group',
      fromBeginning: false,
    });

    await this.kafkaConsumer.run(key, async (message) => {
      this.logger.log(`[KAFKA] Received message`);
      if (!message.value) return;
      try {
        const event = JSON.parse(message.value);
        await this.shippingService.createLabel(event);
      } catch (err) {
        this.logger.error(
          `[KAFKA] ✗ Error processing shipping.create_label: ${err}`,
        );
      }
    });

    this.logger.log('Shipping consumer initialized');
  }

  async onModuleDestroy() {
    await this.kafkaConsumer.disconnect();
  }
}
