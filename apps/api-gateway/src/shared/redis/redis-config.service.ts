import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RedisModuleOptions,
  RedisOptionsFactory,
} from '@liaoliaots/nestjs-redis';

const logger = new Logger('RedisModule');

@Injectable()
export class RedisConfigService implements RedisOptionsFactory {
  constructor(private readonly configService: ConfigService) {}

  createRedisOptions(): RedisModuleOptions {
    return {
      config: {
        host: this.configService.get<string>('redis.host'),
        port: this.configService.get<number>('redis.port'),
        password: this.configService.get<string>('redis.password') || undefined,
        db: this.configService.get<number>('redis.db'),
        onClientCreated(client) {
          client.on('ready', () => logger.log('Redis connected'));
          client.on('error', (err) => logger.error('Redis error', err));
        },
      },
    };
  }
}
