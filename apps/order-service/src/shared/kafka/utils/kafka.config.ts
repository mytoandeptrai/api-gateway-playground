import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, KafkaConfig as KafkaJSConfig } from 'kafkajs';
import { KafkaClientConfig } from '../types/kafka.type';

export interface KafkaConfig extends KafkaJSConfig {
  sessionTimeout?: number;
  heartbeatInterval?: number;
  groupId?: string;
}

@Injectable()
export class KafkaConfigService {
  private readonly config: KafkaConfig;
  private readonly kafka: Kafka;

  constructor(private readonly configService: ConfigService) {
    this.config = this.buildConfig();
    this.kafka = new Kafka({
      clientId: this.config.clientId,
      brokers: this.config.brokers,
      connectionTimeout: this.config.connectionTimeout,
      requestTimeout: this.config.requestTimeout,
      retry: this.config.retry,
    });
  }

  private buildConfig(): KafkaConfig {
    const clientId = this.configService.get<string>('kafka.clientId');
    const brokers = this.configService.get<string>('kafka.brokers');
    const groupId = this.configService.get<string>('kafka.groupId');
    const sessionTimeout = this.configService.get<number>(
      'kafka.sessionTimeout',
      30000,
    );
    const heartbeatInterval = this.configService.get<number>(
      'kafka.heartbeatInterval',
      3000,
    );

    if (!clientId) {
      throw new Error('Kafka clientId is required. Check KAFKA_CLIENT_ID env.');
    }
    if (!brokers) {
      throw new Error('Kafka brokers are required. Check KAFKA_BROKERS env.');
    }

    return {
      clientId,
      brokers: brokers.split(','),
      connectionTimeout: 3000,
      requestTimeout: 30000,
      sessionTimeout,
      heartbeatInterval,
      groupId,
      retry: { initialRetryTime: 100, retries: 8 },
    };
  }

  getKafkaInstance(): Kafka {
    return this.kafka;
  }

  getConfig(): KafkaConfig {
    return this.config;
  }

  getClientConfig(): KafkaClientConfig {
    return {
      clientId: this.config.clientId!,
      brokers: this.config.brokers as string[],
    };
  }
}
