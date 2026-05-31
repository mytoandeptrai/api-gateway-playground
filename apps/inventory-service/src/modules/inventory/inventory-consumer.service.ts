import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { KafkaConsumer } from '@/shared/kafka/utils/kafka.consumer';
import { InventoryService } from './inventory.service';

const GROUP_ID = 'inventory-group';

@Injectable()
export class InventoryConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryConsumerService.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumer,
    private readonly inventoryService: InventoryService,
  ) {}

  async onModuleInit() {
    const TOPICS = [
      'inventory.reserve_stock',
      'inventory.confirm_stock',
      'inventory.release_stock',
    ] as const;

    this.logger.log(`[KAFKA] Subscribing to topics: ${TOPICS.join(', ')}`);
    const key = await this.kafkaConsumer.subscribe({
      topics: [...TOPICS],
      groupId: GROUP_ID,
      fromBeginning: false,
    });
    this.logger.log(`[KAFKA] ✓ Subscribed to all inventory topics`);

    await this.kafkaConsumer.run(key, async (message) => {
      if (!message.value) return;
      try {
        const event = JSON.parse(message.value);
        this.logger.log(
          `[KAFKA] Received ${message.topic}: ${JSON.stringify(event).slice(0, 80)}`,
        );

        switch (message.topic) {
          case 'inventory.reserve_stock':
            await this.inventoryService.reserveStock(event);
            break;
          case 'inventory.confirm_stock':
            await this.inventoryService.confirmStock(event);
            break;
          case 'inventory.release_stock':
            await this.inventoryService.releaseStock(event);
            break;
        }

        this.logger.log(`[KAFKA] ✓ Processed ${message.topic}`);
      } catch (err) {
        this.logger.error(
          `[KAFKA] ✗ Error processing ${message.topic}: ${err}`,
        );
      }
    });

    this.logger.log('Inventory consumers initialized');
  }

  async onModuleDestroy() {
    await this.kafkaConsumer.disconnect();
  }
}
