import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { BackupLog } from './entities/backup-log.entity';
import { RestoreLog } from './entities/restore-log.entity';
import { BackupController } from './backup.controller';
import { BackupService } from './services/backup.service';
import { RestoreService } from './services/restore.service';
import { RetentionService } from './services/retention.service';
import { GoogleDriveService } from './services/google-drive.service';
import { EncryptionService } from './services/encryption.service';
import { RedlockService } from './services/redlock.service';
import { BackupProcessor } from './processors/backup.processor';
import { RestoreProcessor } from './processors/restore.processor';
import { BACKUP_QUEUE, RESTORE_QUEUE } from './backup.constants';
import { BackupScheduler } from './backup.scheduler';
import { KafkaModule } from '@/shared/kafka/kafka.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BackupLog, RestoreLog]),
    BullModule.registerQueue({ name: BACKUP_QUEUE }, { name: RESTORE_QUEUE }),
    ScheduleModule.forRoot(),
    KafkaModule,
  ],
  controllers: [BackupController],
  providers: [
    BackupService,
    RestoreService,
    RetentionService,
    GoogleDriveService,
    EncryptionService,
    RedlockService,
    BackupProcessor,
    RestoreProcessor,
    BackupScheduler,
  ],
})
export class BackupModule {}
