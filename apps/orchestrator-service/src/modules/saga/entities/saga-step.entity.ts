import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SagaInstance } from './saga-instance.entity';

export enum SagaStepStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  COMPENSATING = 'COMPENSATING',
  COMPENSATED = 'COMPENSATED',
  SKIPPED = 'SKIPPED',
}

@Entity({ schema: 'orchestrator' })
export class SagaStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sagaId: string;

  @Column()
  stepName: string;

  @Column({
    type: 'enum',
    enum: SagaStepStatus,
    default: SagaStepStatus.PENDING,
  })
  status: SagaStepStatus;

  @Column({ nullable: true, type: 'varchar' })
  commandTopic: string | null;

  @Column({ nullable: true, type: 'jsonb' })
  payload: object | null;

  @Column({ nullable: true, type: 'jsonb' })
  result: object | null;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ nullable: true, type: 'text' })
  failedReason: string | null;

  @Column({ nullable: true, type: 'timestamptz' })
  startedAt: Date | null;

  @Column({ nullable: true, type: 'timestamptz' })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => SagaInstance, (s) => s.steps)
  @JoinColumn({ name: 'sagaId' })
  saga: SagaInstance;
}
