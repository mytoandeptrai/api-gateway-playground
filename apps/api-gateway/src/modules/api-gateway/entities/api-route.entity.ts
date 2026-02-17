import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Route Target Type
 */
export enum RouteTargetType {
  SERVICE = 'service',
  LAMBDA = 'lambda',
  EXTERNAL = 'external',
  STATIC = 'static',
}

/**
 * Load Balancing Strategy
 */
export enum LoadBalancingStrategy {
  ROUND_ROBIN = 'round_robin',
  LEAST_CONNECTIONS = 'least_connections',
  IP_HASH = 'ip_hash',
  WEIGHTED = 'weighted',
  RANDOM = 'random',
}

/**
 * API Route Entity
 * Defines routing rules for API gateway
 */
@Entity('api_routes')
@Index(['path', 'method'])
@Index(['tenantId'])
export class ApiRoute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Route definition
   */
  @Column({ type: 'varchar', length: 500 })
  path: string; // e.g., '/api/v1/keywords/*'

  @Column({ type: 'varchar', length: 10 })
  method: string; // GET, POST, PUT, DELETE, *, etc.

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  /**
   * Target configuration
   */
  @Column({
    type: 'enum',
    enum: RouteTargetType,
  })
  targetType: RouteTargetType;

  @Column({ type: 'jsonb' })
  targets: Array<{
    url: string;
    weight?: number;
    priority?: number;
    healthCheckUrl?: string;
  }>;

  /**
   * Load balancing
   */
  @Column({
    type: 'enum',
    enum: LoadBalancingStrategy,
    default: LoadBalancingStrategy.ROUND_ROBIN,
  })
  loadBalancingStrategy: LoadBalancingStrategy;

  /**
   * Tenant routing
   */
  @Column({ type: 'uuid', nullable: true })
  tenantId: string; // If null, applies to all tenants

  @Column({ type: 'boolean', default: false })
  isGlobal: boolean;

  /**
   * Request/Response transformation
   */
  @Column({ type: 'jsonb', nullable: true })
  requestTransform: {
    addHeaders?: Record<string, string>;
    removeHeaders?: string[];
    addQueryParams?: Record<string, string>;
    rewritePath?: string;
    stripPrefix?: string;
    addPrefix?: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  responseTransform: {
    addHeaders?: Record<string, string>;
    removeHeaders?: string[];
    statusCodeMapping?: Record<number, number>;
  };

  /**
   * Circuit breaker
   */
  @Column({ type: 'boolean', default: true })
  enableCircuitBreaker: boolean;

  @Column({ type: 'integer', default: 5 })
  circuitBreakerThreshold: number; // Failures before opening

  @Column({ type: 'integer', default: 60 })
  circuitBreakerTimeout: number; // Seconds before retry

  /**
   * Timeouts
   */
  @Column({ type: 'integer', default: 30000 })
  requestTimeout: number; // Milliseconds

  @Column({ type: 'integer', default: 3 })
  retryAttempts: number;

  /**
   * Authentication & Authorization
   */
  @Column({ type: 'boolean', default: true })
  requiresAuth: boolean;

  @Column({ type: 'jsonb', nullable: true })
  allowedRoles: string[];

  /**
   * Rate limiting
   */
  @Column({ type: 'uuid', nullable: true })
  rateLimitRuleId: string;

  /**
   * Caching
   */
  @Column({ type: 'boolean', default: false })
  enableCaching: boolean;

  @Column({ type: 'integer', nullable: true })
  cacheTTL: number; // Seconds

  /**
   * Status
   */
  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'integer', default: 0 })
  priority: number; // Higher priority routes match first

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
  get hasMultipleTargets(): boolean {
    return this.targets.length > 1;
  }

  get requiresLoadBalancing(): boolean {
    return this.hasMultipleTargets;
  }
}
