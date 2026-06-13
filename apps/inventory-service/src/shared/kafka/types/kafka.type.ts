import { ConsumerConfig, KafkaConfig, ProducerRecord } from 'kafkajs';

export type KafkaClientConfig = KafkaConfig & {
  clientId: string;
  brokers: string[];
};

export type KafkaProducerMessage = ProducerRecord;

export type KafkaConsumerOptions = ConsumerConfig & {
  topic?: string;
  topics?: string[];
  groupId: string;
  fromBeginning?: boolean;
  retries?: number;
  instanceId?: number;
};

export type MessageHandler = (message: {
  key: string | null;
  value: string | null;
  topic: string;
  partition: number;
}) => Promise<void>;

export interface IKafkaProducer {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: KafkaProducerMessage): Promise<void>;
}

export interface IKafkaConsumer {
  disconnectConsumer(customerKey: string): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(options: KafkaConsumerOptions): Promise<string>;
  run(consumerKey: string, handler: MessageHandler): Promise<void>;
  createConsumers(
    options: Omit<KafkaConsumerOptions, 'instanceId'>,
    count: number,
    handler: MessageHandler,
  ): Promise<string[]>;
}
