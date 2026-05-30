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
import { UsersModule } from '@/users/users.module';

@Module({
  imports: [
    // Configuration module - must be first
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig],
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

    // Shared Module
    SharedRedisModule,
    CachingModule,

    // Features Modules
    UsersModule,
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
