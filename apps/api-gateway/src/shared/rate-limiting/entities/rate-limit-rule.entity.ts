import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Rate Limit Algorithm
 */
export enum RateLimitAlgorithm {
  TOKEN_BUCKET = 'token_bucket',
  SLIDING_WINDOW = 'sliding_window',
  FIXED_WINDOW = 'fixed_window',
  LEAKY_BUCKET = 'leaky_bucket',
}

/**
 * Rate Limit Scope
 */
export enum RateLimitScope {
  GLOBAL = 'global',
  TENANT = 'tenant',
  USER = 'user',
  IP = 'ip',
  ENDPOINT = 'endpoint',
}

/**
 * Rate Limit Rule Entity
 * Configurable rate limiting rules
 */
@Entity('rate_limit_rules')
@Index(['scope', 'scopeValue'])
@Index(['endpoint'])
export class RateLimitRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Rule identification
   */
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  /**
   * Scope definition
   */
  @Column({
    type: 'enum',
    enum: RateLimitScope,
  })
  scope: RateLimitScope;

  @Column({ type: 'varchar', length: 500, nullable: true })
  scopeValue: string; // tenant ID, user ID, IP, etc.

  @Column({ type: 'varchar', length: 500, nullable: true })
  endpoint: string; // Specific endpoint pattern (e.g., '/api/keywords/*')

  /**
   * Rate limit configuration
   */
  @Column({
    type: 'enum',
    enum: RateLimitAlgorithm,
    default: RateLimitAlgorithm.TOKEN_BUCKET,
  })
  algorithm: RateLimitAlgorithm;

  @Column({ type: 'integer' })
  maxRequests: number; // Max requests per window

  @Column({ type: 'integer' })
  windowSeconds: number; // Time window in seconds

  @Column({ type: 'integer', nullable: true })
  burstSize: number; // For token bucket - max burst

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  refillRate: number; // For token bucket - tokens per second

  /**
   * Rule behavior
   */
  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'integer', default: 0 })
  priority: number; // Higher priority rules apply first

  @Column({ type: 'varchar', length: 500, nullable: true })
  customMessage: string; // Custom error message when limit exceeded

  @Column({ type: 'integer', nullable: true })
  retryAfterSeconds: number; // Suggested retry-after value

  /**
   * Metadata
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Calculated properties
   */
  get requestsPerSecond(): number {
    return this.maxRequests / this.windowSeconds;
  }

  get requestsPerMinute(): number {
    return (this.maxRequests / this.windowSeconds) * 60;
  }

  get requestsPerHour(): number {
    return (this.maxRequests / this.windowSeconds) * 3600;
  }
}
