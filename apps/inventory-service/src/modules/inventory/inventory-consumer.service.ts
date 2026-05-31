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
    const topics = [
      {
        topic: 'inventory.reserve_stock',
        handler: this.inventoryService.reserveStock.bind(this.inventoryService),
      },
      {
        topic: 'inventory.confirm_stock',
        handler: this.inventoryService.confirmStock.bind(this.inventoryService),
      },
      {
        topic: 'inventory.release_stock',
        handler: this.inventoryService.releaseStock.bind(this.inventoryService),
      },
    ];

    for (const { topic, handler } of topics) {
      const key = await this.kafkaConsumer.subscribe({
        topic,
        groupId: GROUP_ID,
        fromBeginning: false,
      });
      await this.kafkaConsumer.run(key, async (message) => {
        if (!message.value) return;
        try {
          const event = JSON.parse(message.value);
          await handler(event);
        } catch (err) {
          this.logger.error(`Error processing ${topic}: ${err}`);
        }
      });
    }

    this.logger.log('Inventory consumers initialized');
  }

  async onModuleDestroy() {
    await this.kafkaConsumer.disconnect();
  }
}
