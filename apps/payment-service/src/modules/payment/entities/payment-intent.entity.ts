import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { OutboxEvent } from './outbox-event.entity';

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
  REFUNDED = 'REFUNDED',
}

@Entity({ schema: 'payment' })
export class PaymentIntent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  orderId: string;

  @Column({ unique: true })
  idempotencyKey: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ nullable: true, unique: true, type: 'varchar' })
  vnpTxnRef: string | null;

  @Column()
  sagaId: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ nullable: true, type: 'text' })
  qrUrl: string | null;

  @Column({ nullable: true, type: 'timestamptz' })
  paymentDeadline: Date | null;

  @Column({ nullable: true, type: 'timestamptz' })
  paidAt: Date | null;

  @Column({ nullable: true, type: 'timestamptz' })
  refundedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => OutboxEvent, (e) => e.intent)
  outboxEvents: OutboxEvent[];
}
