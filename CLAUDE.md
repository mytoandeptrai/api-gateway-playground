# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Full-stack NestJS microservices playground implementing a complete e-commerce backend with an API Gateway, Orchestrator Saga pattern, event-driven communication via Kafka, VNPay payment integration, and real-time notifications. Uses Turborepo + pnpm for monorepo management.

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

Replace `api-gateway` with any app name: `api`, `auth-service`, `order-service`, `product-service`, `inventory-service`, `payment-service`, `shipping-service`, `notification-service`, `refund-service`, or `orchestrator-service`.

### Frontend

```bash
pnpm --filter web dev     # Next.js dev on :3000 (Turbopack)
pnpm --filter web build
```

---

## Architecture

### Applications & Ports

| App                           | Port | Purpose                                                              |
| ----------------------------- | ---- | -------------------------------------------------------------------- |
| `apps/web`                    | 3000 | Next.js 15 (App Router) frontend — products, checkout, orders, refund |
| `apps/api`                    | 3001 | General NestJS API service (Kafka practice, user management)         |
| `apps/api-gateway`            | 3002 | Core gateway — rate limiting, circuit breaking, load balancing, cache |
| `apps/auth-service`           | 3003 | JWT auth — register, login, refresh token, Passport.js              |
| `apps/product-service`        | 3005 | Product catalog — CRUD, price, stock info                            |
| `apps/order-service`          | 3006 | Order management — create order, update status, outbox pattern       |
| `apps/inventory-service`      | 3007 | Stock reservation — Redlock distributed lock, outbox, idempotency    |
| `apps/payment-service`        | 3008 | VNPay payment — QR generation, IPN webhook, timeout scheduler        |
| `apps/shipping-service`       | 3009 | Shipping label + mock delivery simulation (PREPARING → IN_TRANSIT → DELIVERED) |
| `apps/notification-service`   | 3010 | Email (Mailpit) + WebSocket (Socket.IO `/notifications` namespace)   |
| `apps/refund-service`         | 3011 | Refund requests — file upload to MinIO, outbox pattern               |
| `apps/orchestrator-service`   | 3012 | Orchestrator Saga — ORDER_SAGA + REFUND_SAGA, DLQ with retry backoff |

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

| Schema         | Service                 |
| -------------- | ----------------------- |
| `public`       | api                     |
| `gateway`      | api-gateway             |
| `auth`         | auth-service            |
| `product`      | product-service         |
| `orders`       | order-service           |
| `inventory`    | inventory-service       |
| `payment`      | payment-service         |
| `shipping`     | shipping-service        |
| `notification` | notification-service    |
| `refund`       | refund-service          |
| `orchestrator` | orchestrator-service    |

Set `DB_SCHEMA` in each app's `.env` accordingly.

---

## API Gateway — Core Design

The gateway is the entry point for all client requests. Request flow:

1. **Rate limiting** (Redis-backed) — checked first via `RateLimitingService`
   - 4 algorithms: Fixed Window, Sliding Window, Token Bucket, Leaky Bucket
   - Multi-scope: global, tenant, user, IP, endpoint
   - Rules stored in `RateLimitRule` entity; violations recorded in `RateLimitViolation`
2. **Route matching** — `ApiRoute` entity in DB maps `path + method → target URLs`
   - Supports path prefix stripping/rewriting, request/response header transforms
   - Tenant-aware routing (per-tenant or global routes)
3. **Circuit breaker** — per-target state tracking (CLOSED → OPEN → HALF_OPEN)
   - Configurable failure threshold and timeout per route
4. **Load balancing** — Round Robin, Least Connections, IP Hash, Random, Weighted
5. **Request forwarding** — via `@nestjs/axios`
6. **Response caching** — Redis TTL-based cache via `CachingService`
7. **Response transformation** — global `TransformInterceptor` wraps all responses in envelope

Key files:

- `apps/api-gateway/src/modules/api-gateway/api-gateway.service.ts` — core routing, circuit breaker, load balancing
- `apps/api-gateway/src/modules/api-gateway/entities/api-route.entity.ts` — route config (targets, LB strategy, circuit breaker settings)
- `apps/api-gateway/src/shared/rate-limiting/rate-limiting.service.ts` — rate limiting algorithms
- `apps/api-gateway/src/shared/rate-limiting/guards/rate-limit.guard.ts` — NestJS guard wiring
- `apps/api-gateway/src/shared/caching/` — cache decorator and interceptor
- `apps/api-gateway/src/main.ts` — bootstrap (Swagger, Helmet, CORS, global pipes/filters)

Swagger UI: `http://localhost:3002/api/docs` when `SWAGGER_ENABLED=true`.

---

## Orchestrator Saga Pattern

`orchestrator-service` (port 3012) owns both **ORDER_SAGA** and **REFUND_SAGA** using the Orchestrator Saga pattern over Kafka.

### ORDER_SAGA steps

```
order.created
  → inventory.reserve_stock
    ↳ [insufficient] → cancel order
    ↳ [reserved] → create VNPay QR → wait for payment

payment.completed
  → inventory.confirm_stock
    → shipping.create_label
      → update order PREPARING
        → [IN_TRANSIT] → update order SHIPPED
          → shipping.delivered → order DELIVERED (saga COMPLETED)

payment.failed | payment.timeout
  → inventory.release_stock → order CANCELLED
```

### REFUND_SAGA steps

```
refund.requested
  → [validated: approved] → payment.refund_requested → order REFUNDED (saga COMPLETED)
  → [validated: rejected] → refund REJECTED
```

### Reliability features in orchestrator

- **DLQ + retry**: `DlqService` retries 3 times with exponential backoff (1 s → 3 s → 9 s), then publishes to `<topic>.dlq` and marks saga `FAILED`
- **Circuit breaker**: HTTP calls to `payment-service` and `order-service` go through `CircuitBreakerService`
- **Idempotency**: Orchestrator checks for existing `RUNNING` saga before starting a new one

### Key Kafka topics

| Topic | Producer | Consumer |
| ----- | -------- | -------- |
| `order.created` | order-service | orchestrator |
| `inventory.reserve_stock` | orchestrator | inventory-service |
| `inventory.stock_reserved` / `stock_insufficient` / `stock_released` / `stock_confirmed` | inventory-service (outbox) | orchestrator |
| `payment.completed` / `failed` / `timeout` / `refunded` | payment-service (outbox/scheduler) | orchestrator |
| `shipping.create_label` | orchestrator | shipping-service |
| `shipping.label_created` / `status_updated` / `delivered` | shipping-service | orchestrator |
| `notification.send` | orchestrator | notification-service |
| `refund.requested` | refund-service (outbox) | orchestrator |
| `refund.validated` | refund-service | orchestrator |
| `refund.status_updated` | orchestrator | refund-service |

### Outbox pattern

`inventory-service`, `payment-service`, `refund-service`, and `order-service` all use Transactional Outbox: domain changes + outbox event are written in the same DB transaction; a background `OutboxWorker` polls and publishes to Kafka, then marks events as published.

### Distributed lock

`inventory-service` uses **Redlock** (Redis distributed lock) per `productId` to prevent race conditions during stock reservation.

Key files:

- `apps/orchestrator-service/src/modules/saga/order-saga.service.ts` — full saga state machine
- `apps/orchestrator-service/src/modules/saga/saga-consumer.service.ts` — Kafka topic subscriptions + DLQ wiring
- `apps/orchestrator-service/src/shared/dlq/dlq.service.ts` — retry + DLQ logic
- `apps/orchestrator-service/src/shared/circuit-breaker/circuit-breaker.service.ts` — HTTP circuit breaker
- `apps/inventory-service/src/modules/inventory/inventory.service.ts` — Redlock + outbox + idempotency
- `apps/payment-service/src/modules/payment/payment.service.ts` — VNPay QR, IPN webhook
- `apps/payment-service/src/modules/payment/payment-schedule.service.ts` — payment timeout scheduler
- `apps/notification-service/src/modules/notification/notification.gateway.ts` — Socket.IO `/notifications`

---

## Web App (Next.js 15)

Frontend pages under `apps/web/app/`:

| Route | Description |
| ----- | ----------- |
| `/products` | Product listing (root redirects here) |
| `/login` | Auth (JWT, stored in Zustand session store) |
| `/checkout` | Place order |
| `/orders` | Order list |
| `/orders/[orderId]` | Order detail + timeline |
| `/orders/[orderId]/refund` | Submit refund request (file upload) |
| `/payment/[orderId]` | VNPay QR payment page |
| `/payment/callback` | VNPay return URL handler |

Real-time order status updates use `socket.io-client` connecting to `notification-service:3010/notifications`.

---

## Environment Variables

Each NestJS app needs a `.env` file (copy from `.env.example`). Common variables shared by all services:

```env
NODE_ENV=development
DB_HOST=localhost
DB_PORT=1111
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=api-gateway-db
DB_SCHEMA=<see table above>
REDIS_HOST=localhost
REDIS_PORT=1112
KAFKA_BROKERS=localhost:1115
```

Per-service `PORT` values (match `.env` files):

| App                    | PORT |
| ---------------------- | ---- |
| `api`                  | 3001 |
| `api-gateway`          | 3002 |
| `auth-service`         | 3003 |
| `product-service`      | 3005 |
| `order-service`        | 3006 |
| `inventory-service`    | 3007 |
| `payment-service`      | 3008 |
| `shipping-service`     | 3009 |
| `notification-service` | 3010 |
| `refund-service`       | 3011 |
| `orchestrator-service` | 3012 |

Additional service-specific variables:

- **auth-service**: `JWT_SECRET`, `JWT_EXPIRES_IN`, `SMTP_HOST=localhost`, `SMTP_PORT=1113`
- **payment-service**: `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_RETURN_URL`, `PAYMENT_TIMEOUT_MINUTES=15`
- **refund-service**: `MINIO_ENDPOINT=localhost`, `MINIO_PORT=1117`, `MINIO_ACCESS_KEY=minioadmin`, `MINIO_SECRET_KEY=minioadmin`, `MINIO_BUCKET=refund-files`, `REFUND_WINDOW_DAYS=7`
- **notification-service**: `MAIL_HOST=localhost`, `MAIL_PORT=1113`
- **orchestrator-service**: `ORDER_SERVICE_URL=http://localhost:3006`, `PAYMENT_SERVICE_URL=http://localhost:3008`
- **shipping-service**: `MOCK_SHIPPING_INTERVAL_MS=30000`

---

## AI Harness Workflow Integration

This project will run base on Harness Engineering, so before starting any task, please read the `AGENTS.md` file first to understand the rules and workflow.

**Knowledge memory:**

- Use `memory.searchKnowledge` MCP tool before starting tasks to find prior conventions and decisions. Store decisions with `memory.storeKnowledge`. If MCP is unavailable, use the memory skill (`npx ai-devkit memory search/store`).
- Deep-dive documentation is in `personal/explains/` — bilingual (EN/VN) guides for API gateway design, rate limiting algorithms, and caching strategies.
