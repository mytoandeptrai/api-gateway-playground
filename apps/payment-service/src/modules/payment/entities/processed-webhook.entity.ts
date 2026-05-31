import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ schema: 'payment' })
export class ProcessedWebhook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  vnpTxnRef: string;

  @CreateDateColumn()
  processedAt: Date;
}
