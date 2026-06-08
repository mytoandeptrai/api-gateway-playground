import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KafkaConsumer } from '@/shared/kafka/utils/kafka.consumer';
import { ProductStock } from './entities/product-stock.entity';

const GROUP_ID = 'product-stock-group';

@Injectable()
export class StockConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StockConsumerService.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumer,
    @InjectRepository(ProductStock)
    private readonly stockRepo: Repository<ProductStock>,
  ) {}

  async onModuleInit() {
    const key = await this.kafkaConsumer.subscribe({
      topics: ['inventory.stock_updated'],
      groupId: GROUP_ID,
      fromBeginning: false,
    });

    await this.kafkaConsumer.run(key, async (message) => {
      if (!message.value) return;

      const event = JSON.parse(message.value) as {
        payload: { productId: string; available: number };
      };
      const { productId, available } = event.payload;

      await this.stockRepo.upsert({ productId, available }, ['productId']);
      this.logger.log(`[STOCK] productId=${productId} available=${available}`);
    });
  }

  async onModuleDestroy() {
    await this.kafkaConsumer.disconnect();
  }
}
