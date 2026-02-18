import dataSource from '../data-source';
import {
  RateLimitRule,
  RateLimitAlgorithm,
  RateLimitScope,
} from 'src/shared/rate-limiting/entities/rate-limit-rule.entity';

const rules: Partial<RateLimitRule>[] = [
  // ──────────────────────────────────────────────
  // Priority 1: Global safety net (lowest priority, checked last)
  // Protects the entire system from total overload
  // ──────────────────────────────────────────────
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

  // ──────────────────────────────────────────────
  // Priority 10: Endpoint-specific rules (medium priority)
  // Applied to all proxy traffic through the gateway
  // ──────────────────────────────────────────────
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

  // ──────────────────────────────────────────────
  // Priority 15: Admin endpoints (higher priority)
  // Route management — no auth yet, so limit tighter
  // ──────────────────────────────────────────────
  {
    name: 'Admin - Route Management',
    description:
      'Rate limit for route CRUD operations (no auth guard yet, keep tight)',
    scope: RateLimitScope.GLOBAL,
    endpoint: '/api/v1/gateway/routes',
    algorithm: RateLimitAlgorithm.SLIDING_WINDOW,
    maxRequests: 30,
    windowSeconds: 60,
    priority: 15,
    enabled: true,
  },
  {
    name: 'Admin - Rate Limit Management',
    description: 'Rate limit for rate-limiting admin API',
    scope: RateLimitScope.GLOBAL,
    endpoint: '/api/v1/rate-limiting',
    algorithm: RateLimitAlgorithm.SLIDING_WINDOW,
    maxRequests: 30,
    windowSeconds: 60,
    priority: 15,
    enabled: true,
  },

  // ──────────────────────────────────────────────
  // Priority 20: Auth endpoints (highest priority, checked first)
  // Brute force & spam protection
  // ──────────────────────────────────────────────
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
  {
    name: 'Auth - Registration Spam Protection',
    description: 'Prevent mass account creation',
    scope: RateLimitScope.GLOBAL,
    endpoint: '/api/v1/gateway/auth/register',
    algorithm: RateLimitAlgorithm.FIXED_WINDOW,
    maxRequests: 3,
    windowSeconds: 3600,
    priority: 20,
    customMessage:
      'Too many registration attempts. Please try again after 1 hour.',
    retryAfterSeconds: 3600,
    enabled: true,
  },
];

async function runSeed() {
  await dataSource.initialize();
  console.log('Data source initialized. Running gateway seeds...');

  const ruleRepo = dataSource.getRepository(RateLimitRule);

  let created = 0;
  let skipped = 0;

  for (const rule of rules) {
    const exists = await ruleRepo.findOne({ where: { name: rule.name } });
    if (!exists) {
      await ruleRepo.save(ruleRepo.create(rule));
      created++;
      console.log(`  ✓ Created: ${rule.name}`);
    } else {
      skipped++;
      console.log(`  - Skipped (exists): ${rule.name}`);
    }
  }

  console.log(
    `\nSeeding complete. Created: ${created}, Skipped: ${skipped}, Total: ${rules.length}`,
  );
  await dataSource.destroy();
}

runSeed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
