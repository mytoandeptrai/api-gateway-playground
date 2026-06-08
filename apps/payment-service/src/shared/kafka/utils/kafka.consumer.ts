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
    const topicKey = options.topics ? options.topics.join(',') : options.topic;
    const consumerKey = `${topicKey}-${options.groupId}`;

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

    await consumer.subscribe({
      topics: options.topics ?? [options.topic!],
      fromBeginning: options.fromBeginning ?? false,
    });
    this.consumers.set(consumerKey, consumer);
    this.logger.log(
      `[KafkaConsumer] Subscribed to ${topicKey} with group ${options.groupId}`,
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
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        try {
          await handler({
            key: message.key?.toString() ?? null,
            value: message.value?.toString() ?? null,
            topic,
            partition,
          });

          // Commit only after handler resolves successfully.
          // For saga consumers: handler = DlqService.withRetry(), which resolves
          // whether business logic succeeded OR message was forwarded to DLQ.
          // If DLQ send itself fails, withRetry re-throws → we skip commit →
          // message is re-delivered → idempotency guards handle the duplicate.
          await consumer.commitOffsets([
            {
              topic,
              partition,
              offset: (Number(message.offset) + 1).toString(),
            },
          ]);
        } catch (error) {
          // Do NOT commit. Message will be re-delivered after consumer reconnects.
          // Idempotency (ProcessedEvent table) prevents duplicate processing.
          this.logger.error(
            `[KafkaConsumer] Handler failed — skipping commit for ${consumerKey} ` +
              `topic=${topic} partition=${partition} offset=${message.offset}`,
            error instanceof Error
              ? error.message
              : typeof error === 'string'
                ? error
                : 'Unknown error',
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
