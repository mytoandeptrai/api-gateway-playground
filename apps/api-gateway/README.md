# NextMart — System Architecture

NextMart là một e-commerce platform học distributed systems patterns thực tế: Saga, Outbox, DLQ, Circuit Breaker, Idempotency, Distributed Lock.

---

## Tổng quan

```
Browser (Next.js :3000)
        │
        │  /api/* → rewrite → localhost:3002/api/v1/gateway/*
        ▼
API Gateway (:3002)          ← entry point duy nhất cho frontend
        │
        │  HTTP forward (strip /gateway, add /api/v1)
        ├──────────────┬──────────────┬──────────────┬──────────────┐
        ▼              ▼              ▼              ▼              ▼
   auth:3003     product:3005    order:3006    payment:3008   refund:3011
                                     │              │
                                     └──────┬───────┘
                                            │  Kafka events (via Outbox)
                                            ▼
                              orchestrator:3012
                                            │  Kafka commands
                              ┌─────────────┼──────────────┐
                              ▼             ▼              ▼
                        inventory:3007  shipping:3009  notification:3010
```

**Lưu ý thực tế:**
- Orchestrator gọi `payment-service` và `order-service` bằng **HTTP trực tiếp** (không qua Kafka) để tạo QR và cập nhật order status — bọc trong Circuit Breaker (opossum)
- Notification service chỉ subscribe topic `notification.send` — tất cả notification đều được orchestrator dispatch qua topic này
- Frontend dùng Next.js rewrites làm proxy: `/api/*` → gateway, không expose service nào trực tiếp ra browser

---

## API Gateway — Request Pipeline

Request đi qua 6 bước theo thứ tự:

```
① Rate Limiting Guard  →  ② Route Matching  →  ③ Circuit Breaker
        ↓                                               ↓
⑥ Response Cache             ⑤ Forward Request  ←  ④ Load Balancing
   (nếu hit)                    (Axios)
```

### ① Rate Limiting (Redis-backed)

4 thuật toán được implement thực tế, chọn per-route:

| Algorithm | Cơ chế | Dùng khi |
|-----------|--------|---------|
| **Token Bucket** | Refill token theo rate, burst được phép | Global safety net |
| **Sliding Window** | Counter trượt theo thời gian thực | Proxy requests |
| **Fixed Window** | Reset counter theo frame cố định | Login brute force protection |
| **Leaky Bucket** | Queue request, drain đều đặn | Smooth traffic |

Scope có thể là: `GLOBAL`, `TENANT`, `USER`, `IP`, hoặc `ENDPOINT`.

### ② Route Matching

Các routes được seed vào PostgreSQL (bảng `api_route`), gateway lookup theo `path pattern + HTTP method`. 5 routes đang active:

| Pattern | Target |
|---------|--------|
| `/api/v1/gateway/auth*` | `http://localhost:3003` |
| `/api/v1/gateway/products*` | `http://localhost:3005` |
| `/api/v1/gateway/orders*` | `http://localhost:3006` |
| `/api/v1/gateway/payment*` | `http://localhost:3008` |
| `/api/v1/gateway/refund*` | `http://localhost:3011` |

Path transform: `stripPrefix: /api/v1/gateway` → `addPrefix: /api/v1`
Ví dụ: `/api/v1/gateway/orders/123` → `http://localhost:3006/api/v1/orders/123`

### ③ Circuit Breaker (built-in, per route)

Gateway tự quản lý circuit state bằng in-memory `Map<routeId, CircuitState>`:

```
CLOSED → (failure threshold) → OPEN → (resetTimeout 30s) → HALF_OPEN → CLOSED
```

Khác với circuit breaker của orchestrator (dùng opossum library) — gateway dùng implementation riêng.

### ④ Load Balancing

Mỗi route có thể có nhiều `targets`. 4 strategy:
- **Round Robin** — lần lượt theo thứ tự
- **Least Connections** — target ít request nhất
- **Random** — ngẫu nhiên
- **Weighted** — theo trọng số cấu hình

### ⑤ Forward Request

Dùng `@nestjs/axios` (Axios). Trước khi forward có thể transform: `addHeaders`, `removeHeaders`, `addQueryParams`.

### ⑥ Response Caching (Redis)

Chỉ cache GET request với route có `enableCaching = true`. Cache key = target URL. TTL cấu hình per-route.

---

## Orchestrator — Saga Pattern

Orchestrator điều phối toàn bộ order flow. Sử dụng **Kafka** để giao tiếp với các services, **HTTP** để cập nhật order/payment trực tiếp.

### Order Saga (happy path)

```
order.created (Kafka)
    │
    ▼ emit inventory.reserve_stock
inventory.stock_reserved (Kafka)
    │
    ▼ HTTP POST payment-service/create-qr  ← Circuit Breaker
    │  wait payment.completed (Kafka)
    │
    ▼ emit inventory.confirm_stock
inventory.stock_confirmed (Kafka)
    │
    ▼ emit shipping.create_label
shipping.label_created (Kafka)
    │
    ▼ wait shipping.delivered (Kafka)
    │
    ▼ HTTP PATCH order-service/:id/status → DELIVERED  ← Circuit Breaker
    └ emit notification.send
```

### Compensation

| Trigger | Compensation |
|---------|-------------|
| `inventory.stock_insufficient` | HTTP cancel order |
| `payment.timeout` | emit `inventory.release_stock` → wait `inventory.stock_released` → HTTP cancel order |
| `payment.failed` (user cancel) | emit `inventory.release_stock` → wait `inventory.stock_released` → HTTP cancel order |

`cancelReason` được lưu vào `SagaInstance` lúc set `COMPENSATING` nên lý do hủy đúng ngữ nghĩa (timeout khác user cancel).

### Refund Saga

```
refund.requested (Kafka) — emitted by refund-service
    │
    ▼ Orchestrator tạo RefundSaga
    │
    │ refund.validated (Kafka) — refund-service tự validate và emit
    │
    ├── approved → emit payment.refund_requested (Kafka)
    │              ← payment.refunded (Kafka)
    │              → HTTP PATCH order → REFUNDED
    │              → emit notification.send (refund-completed)
    │
    └── rejected → emit notification.send (refund-rejected)
```

### Circuit Breaker (opossum) — cho HTTP calls

Orchestrator dùng `CircuitBreakerService` bọc tất cả HTTP calls đến `payment-service` và `order-service`:
- Error threshold: 50% (min 3 calls)
- Reset: 30 giây
- Timeout per call: 10 giây
- Per-host registry: `localhost:3008` và `localhost:3006` có circuit riêng

### DLQ & Retry

Mọi Kafka message xử lý qua `DlqService.withRetry()`:
```
handler() fail → sleep 1s → retry → sleep 3s → retry → sleep 9s → retry
                                                                      │
                                                              publish <topic>.dlq
                                                              SagaInstance.status = FAILED
```

---

## Kafka — Cách dùng thực tế

**Không dùng `@nestjs/microservices`** — dùng `kafkajs` trực tiếp qua shared module:

```
src/shared/kafka/
├── kafka.module.ts       — NestJS module export 3 utilities
├── utils/kafka.config.ts — Single Kafka instance (singleton)
├── utils/kafka.producer.ts — connect OnModuleInit, send()
├── utils/kafka.consumer.ts — subscribe() → consumerKey, run(key, handler)
└── utils/kafka.admin.ts  — ensureTopics() khi khởi động
```

**Consumer pattern:**
```typescript
const key = await kafkaConsumer.subscribe({ topics: [...], groupId: '...' });
await kafkaConsumer.run(key, async (message) => { ... });
```

**Outbox Pattern** (Order, Payment, Inventory, Refund services):

Business update + outbox write trong **cùng 1 DB transaction** → background worker (`@Cron('*/5 * * * * *')`) publish lên Kafka → mark `published = true`. Đảm bảo không mất event khi service crash.

---

## Idempotency

| Service | Cơ chế |
|---------|--------|
| Inventory | `ProcessedEvent` table — check `eventId` trước khi process |
| Payment | `ProcessedWebhook` table — check `vnpTxnRef` trước khi process IPN |
| Inventory reservations | `UNIQUE(sagaId, productId)` — double reserve không thể xảy ra |
| Notification | `NotificationLog` table — check `eventId`, không gửi email 2 lần |

---

## Database

Single PostgreSQL instance, **1 schema per service** (không shared):

```
api-gateway-db
├── gateway       — ApiRoute, RateLimitRule (gateway config)
├── auth          — User, RefreshToken
├── product       — Product
├── orders        — Order, OutboxEvent
├── inventory     — InventoryItem, StockReservation, ProcessedEvent, OutboxEvent
├── payment       — PaymentIntent, ProcessedWebhook, OutboxEvent
├── shipping      — ShipmentRecord
├── notification  — NotificationLog
├── refund        — RefundRequest, OutboxEvent
└── orchestrator  — SagaInstance, SagaStep
```

`DB_SYNC=true` trong tất cả `.env` dev → TypeORM auto-sync, không cần migration thủ công khi dev.

---

## Infrastructure

```bash
cd docker && docker compose up -d
```

| Port | Service | Dùng bởi |
|------|---------|---------|
| 1111 | PostgreSQL 16 | Tất cả services |
| 1112 | Redis 7 | Gateway (rate limit, cache), orchestrator (Redlock) |
| 1113 | MailPit SMTP | notification-service |
| 1114 | MailPit Web UI | Xem email test |
| 1115 | Kafka (KRaft) | Tất cả services |
| 1116 | Kafka UI | Monitor topics/messages |
| 1117 | MinIO S3 API | refund-service |
| 1118 | MinIO Console | Xem files refund |

---

## Quick Start

```bash
# 1. Install
pnpm install

# 2. Start infra
cd docker && docker compose up -d && cd ..

# 3. Seed gateway routes & rate limit rules
pnpm --filter api-gateway seed

# 4. Start tất cả backend services
pnpm dev:services

# 5. Start frontend
pnpm --filter web dev
```

Test account: `test@nextmart.com` / `Test@123`

Swagger: `http://localhost:{port}/api/docs` (khi `SWAGGER_ENABLED=true`)
