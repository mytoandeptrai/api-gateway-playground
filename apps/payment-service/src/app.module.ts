import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import databaseConfig from '@/config/database.config';
import redisConfig from '@/config/redis.config';
import vnpayConfig from '@/config/vnpay.config';
import { SharedRedisModule } from '@/shared/redis/shared-redis.module';
import { CachingModule } from '@/shared/caching/caching.module';
import { LoggingMiddleware } from '@/shared/middleware/logging.middleware';
import kafkaConfig from '@/config/kafka.config';
import { KafkaModule } from '@/shared/kafka/kafka.module';
import { UsersModule } from '@/users/users.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentModule } from '@/modules/payment/payment.module';

@Module({
  imports: [
    // Configuration module - must be first
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig, kafkaConfig, vnpayConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    // TypeORM Database
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        host: configService.get<string>('database.host'),
        port: configService.get<number>('database.port'),
        username: configService.get<string>('database.username'),
        password: configService.get<string>('database.password'),
        database: configService.get<string>('database.database'),
        schema: configService.get<string>('database.schema'),
        autoLoadEntities: true,
        migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
        synchronize: configService.get<boolean>('database.synchronize', false),
        logging: configService.get<boolean>('database.logging', false),
        ssl: process.env.NODE_ENV === 'production' ? true : false,
        migrationsTableName: 'migrations_api',
        extra: {
          max: 20,
          connectionTimeoutMillis: 5000,
        },
      }),
    }),

    // BullMQ
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get<string>('redis.password') || undefined,
          db: configService.get<number>('redis.db'),
          // Required for BullMQ workers — prevents ioredis from throwing on
          // blocking commands used internally by the worker
          maxRetriesPerRequest: null,
          // Don't block startup waiting for Redis ready signal
          enableReadyCheck: false,
          // Exponential reconnect capped at 30s, stop after 10 attempts (~145s total)
          retryStrategy: (times: number) => {
            if (times > 10) return null;
            return Math.min(times * 1000, 30_000);
          },
        },
      }),
    }),

    // Shared Module
    SharedRedisModule,
    CachingModule,
    KafkaModule,
    PrometheusModule.register({ defaultMetrics: { enabled: true } }),
    ScheduleModule.forRoot(),

    // Features Modules
    UsersModule,
    PaymentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  /**
   * Configure middleware for all routes
   * @param consumer - Middleware consumer to apply middleware
   */
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*path');
  }
}
