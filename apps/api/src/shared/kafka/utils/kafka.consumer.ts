import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Consumer, Kafka } from 'kafkajs';
import { setTimeout as sleep } from 'timers/promises';
import { IKafkaConsumer, KafkaConsumerOptions } from '../types/kafka.type';
import { KafkaConfig, KafkaConfigService } from './kafka.config';

@Injectable()
export class KafkaConsumer implements IKafkaConsumer, OnModuleDestroy {
  private readonly kafka: Kafka;
  private readonly kafkaConfig: KafkaConfig;
  private readonly consumers: Map<string, Consumer> = new Map();
  private readonly logger = new Logger(KafkaConsumer.name);

  constructor(kafkaConfigService: KafkaConfigService) {
    this.kafka = kafkaConfigService.getKafkaInstance();
    this.kafkaConfig = kafkaConfigService.getConfig();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  async subscribe({
    retries = 3,
    ...options
  }: KafkaConsumerOptions): Promise<string> {
    const consumerKey = `${options.topic}-${options.groupId}`;

    if (this.consumers.has(consumerKey)) {
      this.logger.warn(
        `[KafkaConsumer] Consumer already exists for ${consumerKey}`,
      );
      return consumerKey;
    }

    const consumer = this.kafka.consumer({
      groupId: options.groupId,
      sessionTimeout: this.kafkaConfig.sessionTimeout,
      heartbeatInterval: this.kafkaConfig.heartbeatInterval,
    });

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await consumer.connect();
        this.logger.log(`[KafkaConsumer] Connected: ${consumerKey}`);
        break;
      } catch (error) {
        this.logger.error(
          `[KafkaConsumer] Connect attempt ${attempt}/${retries} failed for ${consumerKey}`,
          error instanceof Error ? error.message : String(error),
        );
        if (attempt >= retries) throw error;
        await sleep(1000 * attempt);
      }
    }

    await consumer.subscribe({
      topic: options.topic,
      fromBeginning: options.fromBeginning ?? false,
    });
    this.consumers.set(consumerKey, consumer);
    this.logger.log(
      `[KafkaConsumer] Subscribed to ${options.topic} with group ${options.groupId}`,
    );

    return consumerKey;
  }

  async run(
    consumerKey: string,
    handler: (message: {
      key: string | null;
      value: string | null;
      topic: string;
      partition: number;
    }) => Promise<void>,
  ): Promise<void> {
    const consumer = this.consumers.get(consumerKey);
    if (!consumer) {
      throw new Error(
        `Consumer ${consumerKey} not found. Call subscribe() first.`,
      );
    }

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          await handler({
            key: message.key?.toString() ?? null,
            value: message.value?.toString() ?? null,
            topic,
            partition,
          });
        } catch (error) {
          this.logger.error(
            `[KafkaConsumer] Handler error for ${consumerKey}`,
            error instanceof Error ? error.message : String(error),
          );
        }
      },
    });
  }

  async disconnectConsumer(consumerKey: string): Promise<void> {
    const consumer = this.consumers.get(consumerKey);
    if (!consumer) {
      this.logger.warn(`[KafkaConsumer] Consumer ${consumerKey} not found`);
      return;
    }

    await consumer.disconnect();
    this.consumers.delete(consumerKey);
    this.logger.log(`[KafkaConsumer] Disconnected: ${consumerKey}`);
  }

  async disconnect(): Promise<void> {
    await Promise.all(
      Array.from(this.consumers.keys()).map((key) =>
        this.disconnectConsumer(key),
      ),
    );
    this.logger.log('[KafkaConsumer] All consumers disconnected');
  }

  getActiveConsumers(): string[] {
    return Array.from(this.consumers.keys());
  }
}
