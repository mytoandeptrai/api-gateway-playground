import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('product_stock')
export class ProductStock {
  @PrimaryColumn()
  productId: string;

  @Column({ default: 0 })
  available: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
