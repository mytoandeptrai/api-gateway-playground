import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import databaseConfig from '@/config/database.config';
import redisConfig from '@/config/redis.config';
import { SharedRedisModule } from '@/shared/redis/shared-redis.module';
import { CachingModule } from '@/shared/caching/caching.module';
import { LoggingMiddleware } from '@/shared/middleware/logging.middleware';
import { ProductModule } from '@/modules/product/product.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const schema = configService.get<string>('database.schema', 'public');
        const host = configService.get<string>('database.host');
        const port = configService.get<number>('database.port');
        const username = configService.get<string>('database.username');
        const password = configService.get<string>('database.password');
        const database = configService.get<string>('database.database');

        if (schema !== 'public') {
          const { Client } = await import('pg');
          const pgClient = new Client({
            host,
            port,
            user: username,
            password,
            database,
          });
          await pgClient.connect();
          await pgClient.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
          await pgClient.end();
        }

        return {
          type: 'postgres' as const,
          host,
          port,
          username,
          password,
          database,
          schema,
          autoLoadEntities: true,
          migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
          synchronize: configService.get<boolean>(
            'database.synchronize',
            false,
          ),
          logging: configService.get<boolean>('database.logging', false),
          ssl: process.env.NODE_ENV === 'production',
          migrationsTableName: `migrations_${schema}`,
          extra: { max: 20, connectionTimeoutMillis: 5000 },
        };
      },
    }),

    SharedRedisModule,
    CachingModule,
    ProductModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*path');
  }
}
