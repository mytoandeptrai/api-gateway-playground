import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';

@Entity({ schema: 'orders' })
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

  @ManyToOne(() => Order, (o) => o.outboxEvents)
  @JoinColumn({ name: 'aggregateId' })
  order: Order;
}
