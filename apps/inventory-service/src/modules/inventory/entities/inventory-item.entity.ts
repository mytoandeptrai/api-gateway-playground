import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from 'typeorm';
import { StockReservation } from './stock-reservation.entity';

@Entity({ schema: 'inventory' })
export class InventoryItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  productId: string;

  @Column()
  totalStock: number;

  @Column({ default: 0 })
  reserved: number;

  @Column()
  available: number;

  @OneToMany(() => StockReservation, (r) => r.item)
  reservations: StockReservation[];
}
