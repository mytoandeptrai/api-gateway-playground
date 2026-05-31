# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Full-stack NestJS microservices playground demonstrating an API Gateway with rate limiting, circuit breaking, load balancing, and response caching. Uses Turborepo + pnpm for monorepo management.

**Package manager:** `pnpm@10.11.0` (required — enforced in `engines`). Never use npm or yarn.

---

## Commands

### Root-level (runs across all apps via Turborepo)

```bash
pnpm dev                  # All apps in watch mode
pnpm dev:services         # Backend services only (api-gateway, auth-service, order-service)
pnpm build                # Build all apps
pnpm lint                 # ESLint all apps
pnpm format               # Prettier formatting
pnpm check-types          # TypeScript type checking
pnpm only-infra           # Start Docker infrastructure (cd docker && docker compose up -d)
```

### Per-app (NestJS services)

```bash
pnpm --filter api-gateway dev
pnpm --filter api-gateway test            # Unit tests (Jest)
pnpm --filter api-gateway test:watch
pnpm --filter api-gateway test:cov        # Coverage report
pnpm --filter api-gateway test:e2e
pnpm --filter api-gateway migration:generate -- src/database/migrations/MigrationName
pnpm --filter api-gateway migration:run
pnpm --filter api-gateway seed
```

Replace `api-gateway` with `api`, `auth-service`, or `order-service` as needed.

### Frontend

```bash
pnpm --filter web dev     # Next.js dev on :3000 (Turbopack)
pnpm --filter web build
```

---

## Architecture

### Applications & Ports

| App                  | Port | Purpose                                                          |
| -------------------- | ---- | ---------------------------------------------------------------- |
| `apps/web`           | 3000 | Next.js 15 (App Router) frontend                                 |
| `apps/api`           | 3001 | General NestJS API service                                       |
| `apps/api-gateway`   | 3002 | Core gateway — routing, rate limiting, circuit breaking, caching |
| `apps/auth-service`  | 3003 | JWT auth (Passport.js)                                           |
| `apps/order-service` | 3004 | Order management                                                 |

### Infrastructure Ports (Docker)

All sequential for easy reference:

| Port | Service        | Credentials           |
| ---- | -------------- | --------------------- |
| 1111 | PostgreSQL     | postgres:postgres     |
| 1112 | Redis          | (no auth)             |
| 1113 | Mailpit SMTP   | (no auth)             |
| 1114 | Mailpit Web UI | browser               |
| 1115 | Kafka (KRaft)  | (no ZooKeeper)        |
| 1116 | Kafka UI       | browser               |
| 1117 | MinIO S3 API   | minioadmin:minioadmin |
| 1118 | MinIO Console  | browser               |

Docker volumes live in `docker/volumes/`. Reset everything with `cd docker && docker compose down -v`.

### Shared packages

- `packages/ui` — shadcn/ui component library (`@repo/ui`)
- `packages/eslint-config` — shared ESLint config
- `packages/typescript-config` — shared TS config

### Database layout

Single PostgreSQL instance, one schema per service:

- `gateway` — api-gateway
- `auth` — auth-service
- `orders` — order-service
- `api` — api service

Set `DB_SCHEMA` in each app's `.env` accordingly.

---

## API Gateway — Core Design

The gateway is the most complex service. Request flow:

1. **Rate limiting** (Redis-backed) — checked first via `RateLimitingService`
   - 4 algorithms: Fixed Window, Sliding Window, Token Bucket, Leaky Bucket
   - Multi-scope: global, tenant, user, IP, endpoint
2. **Route matching** — `ApiRoute` entity in DB maps `path + method → target URLs`
3. **Circuit breaker** — per-target state tracking (CLOSED → OPEN → HALF_OPEN)
4. **Load balancing** — Round Robin, Least Connections, Random, Weighted
5. **Request forwarding** — via `@nestjs/axios`
6. **Response caching** — Redis TTL-based cache
7. **Response transformation** — global interceptor adds envelope

Key files:

- `apps/api-gateway/src/modules/api-gateway/api-gateway.service.ts` — core routing, circuit breaker, load balancing
- `apps/api-gateway/src/shared/rate-limiting/rate-limiting.service.ts` — rate limiting algorithms
- `apps/api-gateway/src/shared/caching/` — cache decorator and interceptor
- `apps/api-gateway/src/main.ts` — bootstrap (Swagger, Helmet, CORS, global pipes/filters)

Swagger UI is available at `http://localhost:3002/api/docs` when `SWAGGER_ENABLED=true`.

---

## Environment Variables

Each NestJS app needs a `.env` file. Common variables shared by all services:

```env
NODE_ENV=development
DB_HOST=localhost
DB_PORT=1111
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=api-gateway-db
DB_SCHEMA=<gateway|auth|orders|api>
REDIS_HOST=localhost
REDIS_PORT=1112
KAFKA_BROKERS=localhost:1115
```

---

## AI Harness Workflow Integration

This project will run base on Harness Engineering, so before starting any task, please read the `AGENTS.md` file first to understand the rules and workflow.

**Knowledge memory:**

- Use `memory.searchKnowledge` MCP tool before starting tasks to find prior conventions and decisions. Store decisions with `memory.storeKnowledge`. If MCP is unavailable, use the memory skill (`npx ai-devkit memory search/store`).
- Deep-dive documentation is in `personal/explains/` — bilingual (EN/VN) guides for API gateway design, rate limiting algorithms, and caching strategies.
