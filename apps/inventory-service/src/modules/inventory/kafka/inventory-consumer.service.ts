import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { KafkaAdmin } from '@/shared/kafka/utils/kafka.admin';
import { KafkaConsumer } from '@/shared/kafka/utils/kafka.consumer';
import { BaseTopicHandler } from './handlers/base-topic.handler';
import { INVENTORY_TOPIC_HANDLERS } from './inventory-kafka.constants';

@Injectable()
export class InventoryConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryConsumerService.name);

  constructor(
    private readonly kafkaAdmin: KafkaAdmin,
    private readonly kafkaConsumer: KafkaConsumer,
    @Inject(INVENTORY_TOPIC_HANDLERS)
    private readonly handlers: BaseTopicHandler<unknown>[],
  ) {}

  async onModuleInit() {
    for (const handler of this.handlers) {
      const topic = handler.getTopic();
      const count = handler.getConsumerCount();

      if (count <= 0) {
        this.logger.warn(
          `[KAFKA] Consumer disabled for ${topic} (number_of_consumer_${topic}=0)`,
        );
        continue;
      }

      const partitionCount = handler.getPartitionCount();
      await this.kafkaAdmin.ensureTopicPartitions(topic, partitionCount);

      this.logger.log(
        `[KAFKA] Creating ${count} consumer(s) for topic: ${topic}`,
      );

      await this.kafkaConsumer.createConsumers(
        {
          topics: [topic],
          groupId: handler.getGroupId(),
          fromBeginning: false,
        },
        count,
        handler.asMessageHandler(),
      );
    }

    this.logger.log(
      `[KAFKA] Inventory consumers initialized: ${this.kafkaConsumer.getActiveConsumers().length} total`,
    );
  }

  async onModuleDestroy() {
    await this.kafkaConsumer.disconnect();
  }
}
