import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Order } from './entities/order.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OutboxWorker } from './outbox/outbox.worker';
import { JwtStrategy } from '@/shared/strategies/jwt.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OutboxEvent]),
    HttpModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
      }),
    }),
  ],
  providers: [OrdersService, OutboxWorker, JwtStrategy],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}
