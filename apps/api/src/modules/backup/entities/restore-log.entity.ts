import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum RestoreStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PARTIAL = 'PARTIAL',
}

export enum RestoreMode {
  REPLACE = 'REPLACE',
  MERGE = 'MERGE',
}

@Entity('restore_logs')
export class RestoreLog {
  @PrimaryGeneratedColumn('uuid')
  restoreId: string;

  @Column()
  backupId: string;

  @Column()
  userEmail: string;

  @Column({ type: 'text', array: true })
  collections: string[];

  @Column({ type: 'enum', enum: RestoreMode })
  mode: RestoreMode;

  @Column({ type: 'jsonb', nullable: true })
  collectionStats: Record<string, unknown> | null;

  @Column({ type: 'enum', enum: RestoreStatus, default: RestoreStatus.IN_PROGRESS })
  status: RestoreStatus;

  @Column({ nullable: true })
  error: string | null;

  @CreateDateColumn()
  startTime: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endTime: Date | null;
}
