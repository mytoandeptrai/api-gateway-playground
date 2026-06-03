import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({ schema: 'inventory' })
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
}
