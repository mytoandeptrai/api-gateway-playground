import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { RefundRequest } from './refund-request.entity';

@Entity({ schema: 'refund' })
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  aggregateId: string;

  @Column()
  eventType: string;

  @Column({ type: 'jsonb' })
  payload: object;

  @Column({ default: false })
  published: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => RefundRequest, (r) => r.outboxEvents)
  @JoinColumn({ name: 'aggregateId' })
  request: RefundRequest;
}
