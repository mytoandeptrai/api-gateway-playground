import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { OutboxEvent } from './outbox-event.entity';
import { ShippingAddress } from '../interfaces/shipping-address.interface';

export enum OrderStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  CONFIRMED = 'CONFIRMED',
  PREPARING = 'PREPARING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  REFUND_REQUESTED = 'REFUND_REQUESTED',
  REFUNDED = 'REFUNDED',
}

@Entity({ schema: 'orders' })
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  productId: string;

  @Column()
  productName: string;

  @Column()
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalAmount: number;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING_PAYMENT,
  })
  status: OrderStatus;

  @Column({ type: 'jsonb' })
  shippingAddress: ShippingAddress;

  @Column()
  paymentDeadline: Date;

  @Column({ nullable: true, type: 'varchar' })
  trackingId: string | null;

  @Column({ nullable: true, type: 'timestamptz' })
  deliveredAt: Date | null;

  @Column({ nullable: true, type: 'text' })
  cancelReason: string | null;

  @Column({ nullable: true, unique: true, type: 'varchar' })
  sagaId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => OutboxEvent, (e) => e.order)
  outboxEvents: OutboxEvent[];
}
