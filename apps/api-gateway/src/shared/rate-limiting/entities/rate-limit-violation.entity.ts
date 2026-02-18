import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Rate Limit Violation Entity
 * Logs when rate limits are exceeded
 */
@Entity('rate_limit_violations')
@Index(['tenantId', 'createdAt'])
@Index(['endpoint', 'createdAt'])
@Index(['ipAddress', 'createdAt'])
export class RateLimitViolation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Request details
   */
  @Column({ type: 'uuid', nullable: true })
  tenantId: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @Column({ type: 'varchar', length: 45 })
  ipAddress: string;

  @Column({ type: 'varchar', length: 500 })
  endpoint: string;

  @Column({ type: 'varchar', length: 10 })
  method: string; // GET, POST, etc.

  /**
   * Rate limit details
   */
  @Column({ type: 'uuid' })
  ruleId: string;

  @Column({ type: 'varchar', length: 200 })
  ruleName: string;

  @Column({ type: 'integer' })
  requestCount: number; // Number of requests made

  @Column({ type: 'integer' })
  limitValue: number; // The limit that was exceeded

  @Column({ type: 'integer' })
  windowSeconds: number;

  /**
   * Context
   */
  @Column({ type: 'text', nullable: true })
  userAgent: string;

  @Column({ type: 'jsonb', nullable: true })
  requestHeaders: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  /**
   * Calculated properties
   */
  get excessRequests(): number {
    return this.requestCount - this.limitValue;
  }

  get utilizationPercent(): number {
    return (this.requestCount / this.limitValue) * 100;
  }
}
