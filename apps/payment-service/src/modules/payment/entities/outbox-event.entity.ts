import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PaymentIntent } from './payment-intent.entity';

@Entity({ schema: 'payment' })
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

  @ManyToOne(() => PaymentIntent, (p) => p.outboxEvents)
  @JoinColumn({ name: 'aggregateId' })
  intent: PaymentIntent;
}
