import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { SagaStep } from './saga-step.entity';

export enum SagaStatus {
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  COMPENSATING = 'COMPENSATING',
  COMPENSATED = 'COMPENSATED',
  FAILED = 'FAILED',
}

@Entity({ schema: 'orchestrator' })
export class SagaInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sagaType: string;

  @Column()
  orderId: string;

  @Column()
  userId: string;

  @Column()
  userEmail: string;

  @Column({ type: 'enum', enum: SagaStatus, default: SagaStatus.RUNNING })
  status: SagaStatus;

  @Column()
  currentStep: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => SagaStep, (s) => s.saga)
  steps: SagaStep[];
}
