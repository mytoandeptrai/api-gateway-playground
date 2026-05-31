import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { InventoryItem } from './inventory-item.entity';

export enum ReservationStatus {
  HELD = 'HELD',
  CONFIRMED = 'CONFIRMED',
  RELEASED = 'RELEASED',
}

@Entity({ schema: 'inventory' })
@Unique(['sagaId', 'productId'])
export class StockReservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  productId: string;

  @Column()
  orderId: string;

  @Column()
  sagaId: string;

  @Column()
  quantity: number;

  @Column({
    type: 'enum',
    enum: ReservationStatus,
    default: ReservationStatus.HELD,
  })
  status: ReservationStatus;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => InventoryItem, (i) => i.reservations)
  @JoinColumn({ name: 'productId', referencedColumnName: 'productId' })
  item: InventoryItem;
}
