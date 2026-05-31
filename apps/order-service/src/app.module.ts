import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import databaseConfig from '@/config/database.config';
import redisConfig from '@/config/redis.config';
import jwtConfig from '@/config/jwt.config';
import kafkaConfig from '@/config/kafka.config';
import { CachingModule } from '@/shared/caching/caching.module';
import { LoggingMiddleware } from '@/shared/middleware/logging.middleware';
import { KafkaModule } from '@/shared/kafka/kafka.module';
import { OrdersModule } from '@/modules/orders/orders.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig, kafkaConfig, jwtConfig],
      envFilePath: ['.env.local', '.env'],
    }),

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
        migrationsTableName: 'migrations_order',
        extra: {
          max: 20,
          connectionTimeoutMillis: 5000,
        },
      }),
    }),

    ScheduleModule.forRoot(),
    CachingModule,
    KafkaModule,
    OrdersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*path');
  }
}
