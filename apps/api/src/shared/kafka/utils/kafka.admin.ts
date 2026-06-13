import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Admin, Kafka } from 'kafkajs';
import { setTimeout as sleep } from 'timers/promises';
import { KafkaConfigService } from './kafka.config';

@Injectable()
export class KafkaAdmin implements OnModuleInit, OnModuleDestroy {
  private readonly kafka: Kafka;
  private readonly admin: Admin;
  private readonly logger = new Logger(KafkaAdmin.name);

  constructor(kafkaConfigService: KafkaConfigService) {
    this.kafka = kafkaConfigService.getKafkaInstance();
    this.admin = this.kafka.admin();
  }

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  async connect(retries = 3): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.admin.connect();
        this.logger.log('[KafkaAdmin] Connected');
        return;
      } catch (error) {
        this.logger.error(
          `[KafkaAdmin] Connect attempt ${attempt}/${retries} failed`,
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'Unknown error',
        );
        if (attempt >= retries) throw error;
        await sleep(1000 * attempt);
      }
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.admin.disconnect();
      this.logger.log('[KafkaAdmin] Disconnected');
    } catch (error) {
      this.logger.error(
        '[KafkaAdmin] Disconnect failed',
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Unknown error',
      );
      throw error;
    }
  }

  async createTopic(
    topic: string,
    numPartitions = 3,
    replicationFactor = 1,
  ): Promise<void> {
    try {
      await this.admin.createTopics({
        topics: [{ topic, numPartitions, replicationFactor }],
        waitForLeaders: true,
      });
      this.logger.log(`[KafkaAdmin] Topic created: ${topic}`);
    } catch (error) {
      this.logger.error(
        `[KafkaAdmin] Failed to create topic: ${topic}`,
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Unknown error',
      );
      throw error;
    }
  }

  async listTopics(): Promise<string[]> {
    try {
      return await this.admin.listTopics();
    } catch (error) {
      this.logger.error(
        '[KafkaAdmin] Failed to list topics',
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Unknown error',
      );
      throw error;
    }
  }

  async ensureTopicPartitions(
    topic: string,
    numPartitions: number,
    replicationFactor = 1,
  ): Promise<void> {
    const existingTopics = await this.admin.listTopics();

    if (!existingTopics.includes(topic)) {
      await this.admin.createTopics({
        topics: [{ topic, numPartitions, replicationFactor }],
        waitForLeaders: true,
      });
      this.logger.log(
        `[KafkaAdmin] Created topic ${topic} with ${numPartitions} partition(s)`,
      );
      return;
    }

    const metadata = await this.admin.fetchTopicMetadata({ topics: [topic] });
    const currentCount = metadata.topics[0].partitions.length;

    if (currentCount >= numPartitions) {
      this.logger.log(
        `[KafkaAdmin] Topic ${topic} already has ${currentCount} partition(s), skipping`,
      );
      return;
    }

    await this.admin.createPartitions({
      topicPartitions: [{ topic, count: numPartitions }],
    });
    this.logger.log(
      `[KafkaAdmin] Increased ${topic} partitions: ${currentCount} → ${numPartitions}`,
    );
  }
}
