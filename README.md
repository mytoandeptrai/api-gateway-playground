# API Gateway Playground

An architecture built with NestJS, featuring an API Gateway with dynamic routing, rate limiting, circuit breaker, load balancing, and caching.

## Tech Stack

- **Frontend:** Next.js 15 (App Router), Tailwind CSS, shadcn/ui
- **Backend:** NestJS (multiple microservices)
- **Database:** PostgreSQL + TypeORM
- **Cache:** Redis
- **Message Broker:** Kafka (KRaft)
- **Object Storage:** MinIO (S3-compatible)
- **Monorepo:** Turborepo + pnpm
- **Email (Dev):** Mailpit

## Architecture

```mermaid
graph TB
    Client([Client]) --> Gateway[API Gateway :3002]

    Gateway --> AuthService[Auth Service :3003]
    Gateway --> OrderService[Order Service :3004]
    Gateway --> ApiService[API Service :3001]

    subgraph Infrastructure
        PG[(PostgreSQL :1111)]
        Redis[(Redis :1112)]
        Mailpit[Mailpit :1114]
        Kafka[Kafka :1115]
        KafkaUI[Kafka UI :1116]
        MinIO[MinIO :1117 / :1118]
    end

    Gateway --> Redis
    Gateway --> PG
    AuthService --> PG
    AuthService --> Redis
    AuthService --> Mailpit
    OrderService --> PG
    ApiService --> PG
    ApiService --> Redis

    subgraph "API Gateway Features"
        RateLimit[Rate Limiting]
        CircuitBreaker[Circuit Breaker]
        LoadBalancer[Load Balancing]
        Cache[Response Caching]
        DynamicRouting[Dynamic Routing]
    end

    Gateway --- RateLimit
    Gateway --- CircuitBreaker
    Gateway --- LoadBalancer
    Gateway --- Cache
    Gateway --- DynamicRouting
```

## Request Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant GW as API Gateway
    participant RL as Rate Limiter
    participant RD as Redis
    participant RT as Router
    participant CB as Circuit Breaker
    participant LB as Load Balancer
    participant US as Upstream Service

    C->>GW: HTTP Request
    GW->>RL: Check Rate Limit
    RL->>RD: Get counters
    RD-->>RL: Counter values

    alt Rate Limited
        RL-->>C: 429 Too Many Requests
    else Allowed
        RL->>RD: Increment counters
        GW->>RT: Match route (path + method)
        RT-->>GW: Route config

        alt Route Not Found
            GW-->>C: 404 Not Found
        else Route Found
            GW->>CB: Check circuit state

            alt Circuit Open
                GW-->>C: 503 Service Unavailable
            else Circuit Closed/Half-Open
                GW->>LB: Select target
                LB-->>GW: Target URL
                GW->>US: Forward request
                US-->>GW: Response
                GW->>CB: Record success/failure
                GW-->>C: Proxy response
            end
        end
    end
```

## Project Structure

```
apps/
  ├── web/              # Next.js frontend (port 3000)
  ├── api/              # NestJS API service (port 3001)
  ├── api-gateway/      # API Gateway (port 3002)
  ├── auth-service/     # Authentication service (port 3003)
  └── order-service/    # Order service (port 3004)
packages/
  ├── ui/               # Shared React components (shadcn/ui)
  ├── eslint-config/
  └── typescript-config/
docker/
  └── docker-compose.yml
```

## Quick Start

### 1. Prerequisites

- Node.js >= 18
- pnpm
- Docker

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Start Infrastructure

```bash
docker compose -f docker/docker-compose.yml up -d
```

This starts PostgreSQL, Redis, Mailpit, Kafka, Kafka UI, and MinIO. Data is persisted under `docker/volumes/`.

#### Port pattern (1111–1118)

Local infrastructure uses **sequential host ports** starting at `1111` — easy to trace, one block for all Docker services:

| Host | Container | Service        |
| ---- | --------- | -------------- |
| 1111 | 5432      | PostgreSQL     |
| 1112 | 6379      | Redis          |
| 1113 | 1025      | Mailpit SMTP   |
| 1114 | 8025      | Mailpit Web UI |
| 1115 | 9092      | Kafka          |
| 1116 | 8080      | Kafka UI       |
| 1117 | 9000      | MinIO S3 API   |
| 1118 | 9001      | MinIO Console  |

> **Kafka note:** `KAFKA_ADVERTISED_LISTENERS` is set to `localhost:1115` so host clients receive the correct broker address in metadata.

#### Web UI (browser)

| Service       | URL                   | Credentials                 |
| ------------- | --------------------- | --------------------------- |
| Mailpit       | http://localhost:1114 | —                           |
| Kafka UI      | http://localhost:1116 | —                           |
| MinIO Console | http://localhost:1118 | `minioadmin` / `minioadmin` |

#### App connections (NestJS, CLI, drivers)

Use these from apps running on your host machine (`localhost`):

| Service      | Host        | Port   | Example                                                                |
| ------------ | ----------- | ------ | ---------------------------------------------------------------------- |
| PostgreSQL   | `localhost` | `1111` | `postgresql://postgres:postgres@localhost:1111/api-gateway-db`         |
| Redis        | `localhost` | `1112` | `redis://localhost:1112`                                               |
| Mailpit SMTP | `localhost` | `1113` | No auth required in local dev                                          |
| Kafka        | `localhost` | `1115` | `localhost:1115` (bootstrap server)                                    |
| MinIO S3 API | `localhost` | `1117` | `http://localhost:1117` — access key `minioadmin`, secret `minioadmin` |

> **MinIO buckets:** MinIO starts with no buckets. Create them manually via the [MinIO Console](http://localhost:1118) or add an init sidecar in `docker-compose.yml` for fixed bucket names (e.g. `uploads`).

#### Stop / reset

```bash
# Stop containers
docker compose -f docker/docker-compose.yml down

# Stop and remove persisted data (fresh start)
docker compose -f docker/docker-compose.yml down -v
```

### 4. Environment Setup

Each app under `apps/` needs its own `.env` or `.env.local`. Copy from the matching `.env.example` and align values with the local Docker stack below.

**Shared local infrastructure** (reference for all NestJS services):

```env
# ── Database (PostgreSQL) ──────────────────────────────────────
DB_HOST=localhost
DB_PORT=1111
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=api-gateway-db
DB_SCHEMA=public
DB_SYNC=true
DB_LOGGING=false

# ── Cache (Redis) ────────────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=1112
REDIS_PASSWORD=
REDIS_DB=0

# ── Email (Mailpit SMTP) ─────────────────────────────────────────
SMTP_HOST=localhost
SMTP_PORT=1113
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@localhost

# ── Kafka ────────────────────────────────────────────────────────
KAFKA_BROKERS=localhost:1115
KAFKA_CLIENT_ID=api-gateway-playground
KAFKA_GROUP_ID=api-gateway-playground-group

# ── MinIO (S3-compatible) ────────────────────────────────────────
MINIO_ENDPOINT=localhost
MINIO_PORT=1117
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false
MINIO_BUCKET=uploads
```

**Per-service example** — `apps/api-gateway/.env` (add service-specific vars on top of the shared block):

```env
NODE_ENV=development
PORT=3002
API_PREFIX=api/v1

# CORS
CORS_ENABLED=true
CORS_ORIGINS=http://localhost:3000

# Database — use a dedicated schema per service on the same DB
DB_HOST=localhost
DB_PORT=1111
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=api-gateway-db
DB_SCHEMA=gateway

# Redis
REDIS_HOST=localhost
REDIS_PORT=1112
REDIS_PASSWORD=
REDIS_DB=0

# Swagger
SWAGGER_ENABLED=true
SWAGGER_TITLE=API Gateway API
SWAGGER_DESCRIPTION=API documentation for API Gateway
SWAGGER_VERSION=1.0
SWAGGER_PATH=api/docs
```

Other services follow the same pattern with different `PORT`, `DB_SCHEMA`, and Swagger titles:

| App             | Port | Suggested `DB_SCHEMA` |
| --------------- | ---- | --------------------- |
| `api`           | 3001 | `api`                 |
| `api-gateway`   | 3002 | `gateway`             |
| `auth-service`  | 3003 | `auth`                |
| `order-service` | 3004 | `orders`              |

### 5. Run Migrations

```bash
# Run migrations for each service
pnpm --filter api-gateway migration:run
pnpm --filter auth-service migration:run
```

### 6. Seed Data (Optional)

```bash
# Seed rate limit rules for API Gateway
pnpm --filter api-gateway seed
```

### 7. Run Development

```bash
# Run all apps
pnpm turbo dev

# Run only backend services (without frontend)
pnpm dev:services
```

| App           | URL                   |
| ------------- | --------------------- |
| Web           | http://localhost:3000 |
| API           | http://localhost:3001 |
| API Gateway   | http://localhost:3002 |
| Auth Service  | http://localhost:3003 |
| Order Service | http://localhost:3004 |

## Commands

| Command                             | Description                      |
| ----------------------------------- | -------------------------------- |
| `pnpm turbo dev`                    | Run all apps in development mode |
| `pnpm dev:services`                 | Run backend services only        |
| `pnpm turbo build`                  | Build all apps                   |
| `pnpm turbo lint`                   | Run linting                      |
| `pnpm turbo check-types`            | TypeScript type checking         |
| `pnpm format`                       | Format code with Prettier        |
| `pnpm --filter <app> migration:run` | Run database migrations          |
| `pnpm --filter <app> seed`          | Run database seeds               |

### Testing

```bash
pnpm --filter <app> test          # Unit tests
pnpm --filter <app> test:watch    # Watch mode
pnpm --filter <app> test:e2e      # E2E tests
pnpm --filter <app> test:cov      # Coverage report
```

## Documentation

Deep-dive documentation for each module is available in both English and Vietnamese:

| Topic         | English                                                           | Vietnamese                                                        |
| ------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| API Gateway   | [api-gateway_en.md](docs/personal/explains/api-gateway_en.md)     | [api-gateway_vn.md](docs/personal/explains/api-gateway_vn.md)     |
| Rate Limiting | [rate-limiting_en.md](docs/personal/explains/rate-limiting_en.md) | [rate-limiting_vn.md](docs/personal/explains/rate-limiting_vn.md) |
| Caching       | [caching_en.md](docs/personal/explains/caching_en.md)             | [caching_vn.md](docs/personal/explains/caching_vn.md)             |
