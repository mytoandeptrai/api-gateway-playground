import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationLog } from './entities/notification-log.entity';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { NotificationConsumerService } from './notification-consumer.service';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationLog])],
  providers: [
    NotificationService,
    NotificationGateway,
    NotificationConsumerService,
  ],
})
export class NotificationModule {}
