import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { OutboxEvent } from './outbox-event.entity';

export enum RefundStatus {
  REFUND_PENDING = 'REFUND_PENDING',
  REFUND_APPROVED = 'REFUND_APPROVED',
  REFUND_REJECTED = 'REFUND_REJECTED',
  REFUNDED = 'REFUNDED',
}

@Entity({ schema: 'refund' })
export class RefundRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  orderId: string;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'text', array: true, default: [] })
  fileUrls: string[];

  @Column({ type: 'enum', enum: RefundStatus, default: RefundStatus.REFUND_PENDING })
  status: RefundStatus;

  @Column({ nullable: true, type: 'text' })
  reviewNote: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => OutboxEvent, (e) => e.request)
  outboxEvents: OutboxEvent[];
}
