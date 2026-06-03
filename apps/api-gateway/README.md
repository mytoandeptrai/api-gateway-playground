# NextMart — System Architecture

NextMart là một e-commerce platform học distributed systems patterns thực tế: Saga, Outbox, DLQ, Circuit Breaker, Idempotency, Distributed Lock.

---

## Services

| Service | Port | Giao tiếp | Mô tả |
|---------|------|-----------|-------|
| `web` | 3000 | Browser | Next.js 15 App Router frontend |
| `api-gateway` | 3002 | HTTP (entry point) | Rate limiting, routing, circuit breaker, cache |
| `auth-service` | 3003 | HTTP qua gateway | JWT login, refresh token rotation |
| `product-service` | 3005 | HTTP qua gateway | Product catalog, seed data |
| `order-service` | 3006 | HTTP qua gateway + Kafka | Order CRUD, emit `order.created` |
| `inventory-service` | 3007 | Kafka only | Stock reservation với Redlock |
| `payment-service` | 3008 | HTTP qua gateway + Kafka | VNPay QR, webhook IPN, emit `payment.*` |
| `shipping-service` | 3009 | Kafka only | Mock shipping label + tracking timer |
| `notification-service` | 3010 | Kafka only | Email (MailPit) + WebSocket push |
| `refund-service` | 3011 | HTTP qua gateway + Kafka | Refund request, MinIO upload, auto-validate |
| `orchestrator-service` | 3012 | Kafka + HTTP | Saga orchestration, DLQ, circuit breaker |

## Tổng quan kiến trúc

```
┌─────────────────────────────────────────────────────┐
│  TIER 1 — FRONTEND                                  │
│                                                     │
│  Browser → web (Next.js :3000)                      │
│            /api/* ──rewrite──► gateway:3002         │
└─────────────────────────┬───────────────────────────┘
                          │ HTTP
                          ▼
┌─────────────────────────────────────────────────────┐
│  TIER 2 — API GATEWAY  (:3002)                      │
│                                                     │
│  ① Rate Limiting   — 4 algorithms, Redis-backed     │
│  ② Route Matching  — path pattern lookup (PostgreSQL)│
│  ③ Circuit Breaker — per-route, in-memory state     │
│  ④ Load Balancing  — Round Robin / Weighted / ...   │
│  ⑤ Response Cache  — Redis, TTL per route           │
└──┬─────┬──────┬──────┬──────┬──────────────────────-┘
   │     │      │      │      │  HTTP forward
   ▼     ▼      ▼      ▼      ▼
 auth product order payment refund
:3003 :3005  :3006  :3008  :3011
                │      │      │
                │      │    MinIO :1117
                │      │    (file upload)
                └──┬───┘
                   │ Kafka events (qua Outbox worker)
                   ▼
┌─────────────────────────────────────────────────────┐
│  TIER 3 — ORCHESTRATOR  (:3012)                     │
│                                                     │
│  Saga (Order + Refund) · DLQ · Retry 1s/3s/9s      │
│  Circuit Breaker (opossum) cho HTTP calls           │
└──────┬──────────────────────────┬───────────────────┘
       │ Kafka commands            │ HTTP trực tiếp
       │                          │ (opossum Circuit Breaker)
   ┌───┼──────────┐               │
   ▼   ▼          ▼               ▼
inven- ship-  notif-        order:3006 + payment:3008
tory  ping    cation        (update status, create QR)
:3007 :3009   :3010
               │
             email → MailPit :1113
             socket → Browser (WebSocket)
```

```
┌─────────────────────────────────────────────────────┐
│  INFRASTRUCTURE  (Docker Compose)                   │
│                                                     │
│  PostgreSQL :1111  — 1 instance, 10 schemas riêng   │
│  Redis      :1112  — rate limit + cache + Redlock   │
│  Kafka      :1115  — KRaft (no ZooKeeper)           │
│  MinIO      :1117  — S3-compatible file storage     │
│  MailPit    :1113  — local SMTP (email testing)     │
│                                                     │
│  UI tools: Kafka UI :1116 · MinIO Console :1118     │
│            MailPit Web :1114                        │
└─────────────────────────────────────────────────────┘
```

**Điểm quan trọng:**
- Gateway là **entry point duy nhất** — browser không gọi thẳng vào bất kỳ service nào
- `inventory`, `shipping`, `notification` chỉ nhận lệnh qua **Kafka**, không có route trên gateway
- Orchestrator gọi `order-service` và `payment-service` bằng **HTTP trực tiếp** (có opossum circuit breaker), không qua gateway
- `notification-service` chỉ subscribe **1 topic** (`notification.send`) — orchestrator là nơi duy nhất dispatch notification
- PostgreSQL là **1 instance** nhưng mỗi service dùng **schema riêng biệt**, không share bảng

## Infrastructure (Docker)

| Port | Service | Dùng bởi |
|------|---------|---------|
| 1111 | PostgreSQL 16 | Tất cả services (mỗi service 1 schema) |
| 1112 | Redis 7 | Gateway (rate limit, response cache), Inventory (Redlock) |
| 1113 | MailPit SMTP | notification-service gửi email |
| 1114 | MailPit Web UI | Xem email trong lúc dev/test |
| 1115 | Kafka (KRaft) | Tất cả services publish/consume events |
| 1116 | Kafka UI | Monitor topics, messages, consumer groups |
| 1117 | MinIO S3 API | refund-service upload ảnh minh chứng |
| 1118 | MinIO Console | Xem files đã upload |

```bash
# Start toàn bộ infra
cd docker && docker compose up -d

# Reset sạch (xóa cả data)
cd docker && docker compose down -v
```

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
