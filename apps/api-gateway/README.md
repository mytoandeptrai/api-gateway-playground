# NextMart — System Architecture Overview

NextMart là một e-commerce platform được xây dựng theo kiến trúc microservices, sử dụng Kafka làm message bus và Orchestration-based Saga để quản lý distributed transactions. Toàn bộ traffic từ frontend đi qua API Gateway trước khi tới các services.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Browser (Next.js :3000)                   │
└───────────────────────────────────┬─────────────────────────────────┘
                                    │ HTTP
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        API Gateway (:3002)                          │
│                                                                     │
│  ① Rate Limiting (Redis)   ② Route Matching (PostgreSQL)           │
│  ③ Circuit Breaker         ④ Load Balancing                        │
│  ⑤ Request Forwarding      ⑥ Response Caching (Redis)             │
└──────┬──────┬──────┬──────┬──────┬──────────────────────────────────┘
       │      │      │      │      │  HTTP forward
       ▼      ▼      ▼      ▼      ▼
  auth  product  order  payment  refund  (và các services khác)
  :3003  :3005  :3006   :3008   :3011
```

---

## Services & Ports

| Service | Port | Mô tả |
|---------|------|-------|
| `web` | 3000 | Next.js 15 App Router — frontend |
| `api-gateway` | 3002 | Entry point — routing, rate limiting, circuit breaking |
| `auth-service` | 3003 | JWT authentication, refresh token rotation |
| `product-service` | 3005 | Product catalog, seed data |
| `order-service` | 3006 | Order creation và management |
| `inventory-service` | 3007 | Stock reservation với Redlock |
| `payment-service` | 3008 | VNPay QR integration, webhook IPN |
| `shipping-service` | 3009 | Mock shipping label + tracking |
| `notification-service` | 3010 | Email (MailPit) + WebSocket (Socket.io) |
| `refund-service` | 3011 | Refund request, MinIO file upload |
| `orchestrator-service` | 3012 | Saga orchestration, DLQ, circuit breaker |

---

## API Gateway — Chi tiết

API Gateway là service duy nhất nhận request từ frontend. Mọi request đi theo pipeline:

```
Request đến
    │
    ▼
① Rate Limiting Guard
    ├── Kiểm tra Redis: token bucket / sliding window / fixed window / leaky bucket
    ├── Scope: global, tenant, user, IP, endpoint
    └── Vượt quá → 429 Too Many Requests
    │
    ▼
② Route Matching
    ├── Tìm ApiRoute trong DB theo path pattern + HTTP method
    └── Không khớp → 404
    │
    ▼
③ Circuit Breaker (per target URL)
    ├── CLOSED: forward bình thường
    ├── OPEN: trả ngay 503 (không gọi service)
    └── HALF-OPEN: thử 1 request sau 30s
    │
    ▼
④ Load Balancing
    ├── Round Robin
    ├── Least Connections
    ├── Random
    └── Weighted
    │
    ▼
⑤ Cache Check (Redis)
    ├── GET request + route có enableCaching=true → trả cache nếu hit
    └── Miss → forward
    │
    ▼
⑥ Forward Request → Backend Service
    │
    ▼
⑦ Cache Response (nếu applicable)
    │
    ▼
Response về Client
```

### Rate Limiting Algorithms

| Algorithm | Dùng khi |
|-----------|----------|
| **Fixed Window** | Giới hạn đơn giản theo khung thời gian cố định |
| **Sliding Window** | Chính xác hơn Fixed, không có burst tại boundary |
| **Token Bucket** | Cho phép burst ngắn, rate trung bình được kiểm soát |
| **Leaky Bucket** | Smooth traffic, không cho phép burst |

---

## Core User Flow

```
Login
  │
  ▼
Product List (/products)
  │
  ▼
Checkout (/checkout?productId=xxx)
  │  POST /orders
  ▼
Payment Page (/payment/:orderId)
  │  QR VNPay — 15 phút countdown
  ▼
Order Detail (/orders/:orderId)
  │  (sau khi DELIVERED và ≤ 7 ngày)
  ▼
Refund Request (/orders/:orderId/refund)
```

---

## Order Saga Flow (Orchestrator Pattern)

Khi user tạo đơn hàng, `orchestrator-service` điều phối toàn bộ luồng qua Kafka:

```
order.created
    │
    ▼
[Step 1] RESERVE_INVENTORY
    ├── Command → inventory.reserve_stock (Redlock per productId)
    ├── OK     → AWAIT_PAYMENT
    └── Fail   → cancel order, notify user
    │
    ▼
[Step 2] AWAIT_PAYMENT
    ├── Wait   ← payment.completed (VNPay webhook)
    ├── Timeout (15 phút) → release stock, cancel order
    └── Fail (user cancel) → release stock, cancel order
    │
    ▼
[Step 3] CONFIRM_INVENTORY
    ├── Command → inventory.confirm_stock
    └── OK     → CREATE_SHIPPING
    │
    ▼
[Step 4] CREATE_SHIPPING
    ├── Command → shipping.create_label (mock)
    └── OK     → AWAIT_DELIVERY
    │
    ▼
[Step 5] AWAIT_DELIVERY
    └── Wait ← shipping.delivered (mock timer)
    │
    ▼
[COMPLETE] order = DELIVERED, email gửi user
```

### Compensation Matrix

| Bước fail | Release Stock | Refund Payment | Cancel Order |
|-----------|:---:|:---:|:---:|
| RESERVE_INVENTORY | — | — | ✅ |
| AWAIT_PAYMENT (timeout/cancel) | ✅ | — | ✅ |
| CONFIRM_INVENTORY | ✅ | ✅* | ✅ |
| CREATE_SHIPPING | ✅ | ✅ | ✅ |

*Refund chỉ nếu payment đã nhận.

---

## Refund Saga Flow

```
User submit refund request
    │
    ▼
refund.requested (Kafka)
    │
    ├── Orchestrator: tạo RefundSaga
    │
    ▼
refund.validated (Refund Service tự validate)
    │
    ├── APPROVED → payment.refund_requested → payment.refunded
    │              → order.status = REFUNDED, email user
    │
    └── REJECTED → email user với lý do
```

---

## Resilience Patterns

### DLQ (Dead Letter Queue)

Khi Kafka consumer xử lý message thất bại:

```
Handler fail
    │
    ├── Retry attempt 1 (wait 1s)
    ├── Retry attempt 2 (wait 3s)
    ├── Retry attempt 3 (wait 9s)
    │
    └── Exhausted → publish <topic>.dlq + SagaInstance.status = FAILED
```

DLQ message chứa original event + error message để dev tự xử lý thủ công.

### Circuit Breaker (Orchestrator → Services)

```
HTTP call đến service X
    │
    ├── CLOSED  → gọi bình thường, track error rate
    ├── OPEN    → 503 ngay, không gọi (mở khi error ≥ 50% / min 3 calls)
    └── HALF-OPEN → thử 1 request sau 30s
```

Per-host breaker: `localhost:3008` và `localhost:3006` có circuit độc lập.

### Outbox Pattern

Đảm bảo Kafka message không bị mất khi service crash:

```
BEGIN TRANSACTION
  ├── Update business table
  └── INSERT outbox_event (published=false)
COMMIT

Background worker (mỗi 5 giây)
  └── Fetch unpublished → publish Kafka → mark published=true
```

Services có Outbox: Order, Payment, Inventory, Refund.

---

## Kafka Topics

| Topic | Publisher | Consumer | Loại |
|-------|-----------|----------|------|
| `order.created` | Order | Orchestrator | Event |
| `inventory.reserve_stock` | Orchestrator | Inventory | Command |
| `inventory.stock_reserved` | Inventory | Orchestrator | Event |
| `inventory.stock_insufficient` | Inventory | Orchestrator | Event |
| `inventory.confirm_stock` | Orchestrator | Inventory | Command |
| `inventory.release_stock` | Orchestrator | Inventory | Command |
| `payment.completed` | Payment | Orchestrator | Event |
| `payment.failed` | Payment | Orchestrator | Event |
| `payment.timeout` | Payment | Orchestrator | Event |
| `payment.refund_requested` | Orchestrator | Payment | Command |
| `payment.refunded` | Payment | Orchestrator | Event |
| `shipping.create_label` | Orchestrator | Shipping | Command |
| `shipping.label_created` | Shipping | Orchestrator | Event |
| `shipping.status_updated` | Shipping | Orchestrator | Event |
| `shipping.delivered` | Shipping | Orchestrator | Event |
| `notification.send` | Orchestrator | Notification | Command |
| `refund.requested` | Refund | Orchestrator, Refund | Event |
| `refund.validated` | Refund | Orchestrator | Event |
| `refund.status_updated` | Orchestrator | Refund | Command |
| `*.dlq` | auto | Manual intervention | DLQ |

---

## Infrastructure (Docker)

| Port | Service | Credentials |
|------|---------|------------|
| 1111 | PostgreSQL 16 | postgres:postgres |
| 1112 | Redis 7 | (no auth) |
| 1113 | MailPit SMTP | (no auth) |
| 1114 | MailPit Web UI | browser |
| 1115 | Kafka (KRaft) | (no auth) |
| 1116 | Kafka UI | browser |
| 1117 | MinIO S3 API | minioadmin:minioadmin |
| 1118 | MinIO Console | browser |

```bash
# Start infrastructure
cd docker && docker compose up -d

# Reset everything
cd docker && docker compose down -v
```

### Database Layout

Single PostgreSQL instance, một schema per service:

```
api-gateway-db
├── gateway      (api-gateway)
├── auth         (auth-service)
├── product      (product-service)
├── orders       (order-service)
├── inventory    (inventory-service)
├── payment      (payment-service)
├── shipping     (shipping-service)
├── notification (notification-service)
├── refund       (refund-service)
└── orchestrator (orchestrator-service)
```

---

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Start infrastructure
cd docker && docker compose up -d && cd ..

# 3. Seed API Gateway routes
pnpm --filter api-gateway seed

# 4. Start all backend services
pnpm dev:services

# 5. Start frontend
pnpm --filter web dev
```

Tài khoản test: `test@nextmart.com` / `Test@123`

Swagger UI: `http://localhost:{port}/api/docs` (khi `SWAGGER_ENABLED=true`)

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15 (App Router), TanStack Query, Zustand, Tailwind CSS, shadcn/ui |
| Backend | NestJS 11, TypeORM 0.3, TypeScript 5 |
| Message Bus | Kafka (KRaft, no ZooKeeper) via kafkajs |
| Database | PostgreSQL 16 |
| Cache / Lock | Redis 7, Redlock |
| Payment | VNPay Sandbox (nestjs-vnpay) |
| File Storage | MinIO (S3-compatible) |
| Email | MailPit (local SMTP) |
| Real-time | Socket.io v4 |
| Build | Turborepo + pnpm workspaces |
