import dataSource from '../data-source';
import {
  RateLimitRule,
  RateLimitAlgorithm,
  RateLimitScope,
} from 'src/shared/rate-limiting/entities/rate-limit-rule.entity';
import {
  ApiRoute,
  RouteTargetType,
  LoadBalancingStrategy,
} from 'src/modules/api-gateway/entities/api-route.entity';

// ─── Rate Limit Rules ────────────────────────────────────────────────────────

const rules: Partial<RateLimitRule>[] = [
  {
    name: 'Global Safety Net',
    description:
      'Overall system protection — limits total requests across all clients',
    scope: RateLimitScope.GLOBAL,
    algorithm: RateLimitAlgorithm.TOKEN_BUCKET,
    maxRequests: 5000,
    windowSeconds: 60,
    burstSize: 500,
    refillRate: 83,
    priority: 1,
    enabled: true,
  },
  {
    name: 'Gateway Proxy - Standard',
    description:
      'Default rate limit for all proxy requests through the gateway',
    scope: RateLimitScope.GLOBAL,
    endpoint: '/api/v1/gateway',
    algorithm: RateLimitAlgorithm.SLIDING_WINDOW,
    maxRequests: 1000,
    windowSeconds: 60,
    priority: 10,
    enabled: true,
  },
  {
    name: 'Auth - Login Brute Force Protection',
    description: 'Prevent brute force login attempts',
    scope: RateLimitScope.GLOBAL,
    endpoint: '/api/v1/gateway/auth/login',
    algorithm: RateLimitAlgorithm.FIXED_WINDOW,
    maxRequests: 5,
    windowSeconds: 60,
    priority: 20,
    customMessage: 'Too many login attempts. Please try again after 1 minute.',
    retryAfterSeconds: 60,
    enabled: true,
  },
];

// ─── API Routes ──────────────────────────────────────────────────────────────

const routes: Partial<ApiRoute>[] = [
  {
    name: 'Auth Service',
    description: 'Routes all auth requests to auth-service:3003',
    path: '/api/v1/gateway/auth*',
    method: '*',
    targetType: RouteTargetType.SERVICE,
    targets: [{ url: 'http://localhost:3003' }],
    loadBalancingStrategy: LoadBalancingStrategy.ROUND_ROBIN,
    requestTransform: {
      stripPrefix: '/api/v1/gateway',
      addPrefix: '/api/v1',
    },
    requiresAuth: false,
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeout: 30,
    requestTimeout: 10000,
    retryAttempts: 2,
    enableCaching: false,
    enabled: true,
    isGlobal: true,
    priority: 10,
  },
  {
    name: 'Product Service',
    description: 'Routes all product requests to product-service:3005',
    path: '/api/v1/gateway/products*',
    method: '*',
    targetType: RouteTargetType.SERVICE,
    targets: [{ url: 'http://localhost:3005' }],
    loadBalancingStrategy: LoadBalancingStrategy.ROUND_ROBIN,
    requestTransform: {
      stripPrefix: '/api/v1/gateway',
      addPrefix: '/api/v1',
    },
    requiresAuth: false,
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeout: 30,
    requestTimeout: 10000,
    retryAttempts: 2,
    enableCaching: true,
    cacheTTL: 60,
    enabled: true,
    isGlobal: true,
    priority: 10,
  },
  {
    name: 'Order Service',
    description: 'Routes all order requests to order-service:3006',
    path: '/api/v1/gateway/orders*',
    method: '*',
    targetType: RouteTargetType.SERVICE,
    targets: [{ url: 'http://localhost:3006' }],
    loadBalancingStrategy: LoadBalancingStrategy.ROUND_ROBIN,
    requestTransform: {
      stripPrefix: '/api/v1/gateway',
      addPrefix: '/api/v1',
    },
    requiresAuth: false,
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeout: 30,
    requestTimeout: 15000,
    retryAttempts: 1,
    enableCaching: false,
    enabled: true,
    isGlobal: true,
    priority: 10,
  },
  {
    name: 'Payment Service',
    description: 'Routes all payment requests to payment-service:3008',
    path: '/api/v1/gateway/payment*',
    method: '*',
    targetType: RouteTargetType.SERVICE,
    targets: [{ url: 'http://localhost:3008' }],
    loadBalancingStrategy: LoadBalancingStrategy.ROUND_ROBIN,
    requestTransform: {
      stripPrefix: '/api/v1/gateway',
      addPrefix: '/api/v1',
    },
    requiresAuth: false,
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeout: 30,
    requestTimeout: 10000,
    retryAttempts: 1,
    enableCaching: false,
    enabled: true,
    isGlobal: true,
    priority: 10,
  },
  {
    name: 'Refund Service',
    description: 'Routes all refund requests to refund-service:3011',
    path: '/api/v1/gateway/refund*',
    method: '*',
    targetType: RouteTargetType.SERVICE,
    targets: [{ url: 'http://localhost:3011' }],
    loadBalancingStrategy: LoadBalancingStrategy.ROUND_ROBIN,
    requestTransform: {
      stripPrefix: '/api/v1/gateway',
      addPrefix: '/api/v1',
    },
    requiresAuth: false,
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeout: 30,
    requestTimeout: 30000,
    retryAttempts: 1,
    enableCaching: false,
    enabled: true,
    isGlobal: true,
    priority: 10,
  },
];

// ─── Runner ──────────────────────────────────────────────────────────────────

async function runSeed() {
  await dataSource.initialize();
  // Ensure schema and tables exist before seeding
  const schema = process.env.DB_SCHEMA || 'public';
  await dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await dataSource.synchronize();

  console.log('Data source initialized. Running gateway seeds...');

  // Seed rate limit rules
  const ruleRepo = dataSource.getRepository(RateLimitRule);
  for (const rule of rules) {
    const exists = await ruleRepo.findOne({ where: { name: rule.name } });
    if (!exists) {
      await ruleRepo.save(ruleRepo.create(rule));
      console.log(`  ✓ Rule: ${rule.name}`);
    } else {
      console.log(`  - Skipped rule: ${rule.name}`);
    }
  }

  // Seed routes (upsert by name)
  const routeRepo = dataSource.getRepository(ApiRoute);
  for (const route of routes) {
    const existing = await routeRepo.findOne({ where: { name: route.name } });
    if (existing) {
      await routeRepo.update(existing.id, route);
      console.log(`  ↺ Updated route: ${route.name} (${route.path})`);
    } else {
      await routeRepo.save(routeRepo.create(route));
      console.log(`  ✓ Created route: ${route.name} (${route.path})`);
    }
  }

  console.log('\nGateway seeding complete.');
  await dataSource.destroy();
}

runSeed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
