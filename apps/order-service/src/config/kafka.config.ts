import { registerAs } from '@nestjs/config';

export default registerAs('kafka', () => ({
  brokers: process.env.KAFKA_BROKERS || 'localhost:1115',
  clientId: process.env.KAFKA_CLIENT_ID || 'api',
  groupId: process.env.KAFKA_GROUP_ID || 'api-group',
  sessionTimeout: parseInt(process.env.KAFKA_SESSION_TIMEOUT, 10) || 1200000,
  heartbeatInterval: parseInt(process.env.KAFKA_HEARTBEAT_INTERVAL, 10) || 5000,
}));
