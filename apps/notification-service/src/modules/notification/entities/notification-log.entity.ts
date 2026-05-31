import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ schema: 'notification' })
export class NotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ unique: true })
  eventId: string;

  @Column()
  type: string;

  @Column()
  channel: string;

  @Column({ type: 'jsonb' })
  payload: object;

  @Column({ default: 'SENT' })
  status: string;

  @CreateDateColumn()
  sentAt: Date;
}
