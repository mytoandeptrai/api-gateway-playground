import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum BackupStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

@Entity('backup_logs')
export class BackupLog {
  @PrimaryGeneratedColumn('uuid')
  backupId: string;

  @Column({
    type: 'enum',
    enum: BackupStatus,
    default: BackupStatus.IN_PROGRESS,
  })
  status: BackupStatus;

  @CreateDateColumn()
  startTime: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endTime: Date | null;

  @Column({ type: 'bigint', nullable: true })
  size: number | null;

  @Column({ nullable: true })
  location: string | null;

  @Column({ nullable: true })
  fileId: string | null;

  @Column({ nullable: true })
  error: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ default: false })
  isAutomatic: boolean;
}
