# NextMart — Product Specification

**Version**: 3.0  
**Date**: 30/05/2026  
**Status**: FINAL

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Infrastructure](#3-infrastructure)
4. [Services & Ports](#4-services--ports)
5. [User Stories & Acceptance Criteria](#5-user-stories--acceptance-criteria)
6. [API Contracts](#6-api-contracts)
7. [Database Schemas](#7-database-schemas)
8. [Kafka Topics & Event Payloads](#8-kafka-topics--event-payloads)
9. [Saga Flows](#9-saga-flows)
10. [Outbox Pattern](#10-outbox-pattern)
11. [Frontend Pages & Components](#11-frontend-pages--components)
12. [Error Handling & Resilience](#12-error-handling--resilience)
13. [Development Phases & Checklist](#13-development-phases--checklist)
14. [Environment Variables](#14-environment-variables)
15. [Open Questions](#15-open-questions)

---

## 1. Project Overview

**NextMart** là một customer-facing e-commerce web application được xây dựng theo kiến trúc microservices với mục tiêu học sâu về distributed systems patterns trong môi trường thực tế.

### 1.1 Mục tiêu học thuật


| #   | Mục tiêu                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | Hiểu cách services giao tiếp qua Kafka trong event-driven architecture                                                     |
| 2   | Xử lý các case thực tế: data race, idempotency, duplicate charge, distributed lock                                         |
| 3   | Vận hành Kafka: partition ordering, duplicate message, consumer group                                                      |
| 4   | Nắm vững patterns: Saga (Orchestrator), Compensating Transactions, Outbox Pattern, Eventual Consistency, Dead Letter Queue |


### 1.2 Core User Flow

```
Login → Product List → Mua ngay → Điền địa chỉ → QR Payment (15 phút)
     → Order Management → (sau 7 ngày DELIVERED) → Refund Request
```

---

## 2. Tech Stack

### Frontend


| Tech                     | Version         | Mục đích              |
| ------------------------ | --------------- | --------------------- |
| Next.js                  | 15 (App Router) | Framework             |
| ShadCN/UI + Tailwind CSS | latest          | UI components         |
| TanStack Query           | v5              | Server state, caching |
| Zod                      | v3              | Schema validation     |
| Socket.io-client         | v4              | Real-time WebSocket   |
| TypeScript               | 5.x             | Type safety           |


### Backend


| Tech          | Version | Mục đích                           |
| ------------- | ------- | ---------------------------------- |
| NestJS        | 10.x    | Backend framework                  |
| TypeORM       | 0.3.x   | ORM                                |
| PostgreSQL    | 16      | Primary database                   |
| Kafka (KRaft) | 3.x     | Message bus                        |
| Redis         | 7.x     | Cache + Distributed Lock (Redlock) |
| MinIO         | latest  | File storage (S3-compatible)       |
| VNPay         | Sandbox | Payment gateway                    |
| MailPit       | latest  | Local email testing                |
| Socket.io     | v4      | WebSocket server                   |
| opossum       | v8      | Circuit breaker                    |
| pino          | v8      | Structured logging                 |


### DevOps


| Tech           | Mục đích                     |
| -------------- | ---------------------------- |
| Turborepo      | Monorepo build orchestration |
| pnpm           | Package manager (enforced)   |
| Docker Compose | Local infrastructure         |


---

## 3. Infrastructure

### 3.1 Docker Services


| Port | Service        | Credentials           | Mục đích         |
| ---- | -------------- | --------------------- | ---------------- |
| 1111 | PostgreSQL 16  | postgres:postgres     | Primary database |
| 1112 | Redis 7        | (no auth)             | Cache + Lock     |
| 1113 | MailPit SMTP   | (no auth)             | Email testing    |
| 1114 | MailPit Web UI | browser               | Xem email đã gửi |
| 1115 | Kafka (KRaft)  | (no auth)             | Message bus      |
| 1116 | Kafka UI       | browser               | Monitor topics   |
| 1117 | MinIO S3 API   | minioadmin:minioadmin | File storage     |
| 1118 | MinIO Console  | browser               | Manage buckets   |


### 3.2 Database Layout

Single PostgreSQL instance, **một schema per service**:


| Schema         | Service              |
| -------------- | -------------------- |
| `gateway`      | api-gateway          |
| `auth`         | auth-service         |
| `product`      | product-service      |
| `orders`       | order-service        |
| `inventory`    | inventory-service    |
| `payment`      | payment-service      |
| `shipping`     | shipping-service     |
| `notification` | notification-service |
| `refund`       | refund-service       |
| `orchestrator` | orchestrator-service |


---

## 4. Services & Ports


| Service                     | Port | DB Schema      | Swagger          |
| --------------------------- | ---- | -------------- | ---------------- |
| `apps/web`                  | 3000 | —              | —                |
| `apps/api-gateway`          | 3002 | `gateway`      | `:3002/api/docs` |
| `apps/auth-service`         | 3003 | `auth`         | `:3003/api/docs` |
| `apps/product-service`      | 3005 | `product`      | `:3005/api/docs` |
| `apps/order-service`        | 3006 | `orders`       | `:3006/api/docs` |
| `apps/inventory-service`    | 3007 | `inventory`    | `:3007/api/docs` |
| `apps/payment-service`      | 3008 | `payment`      | `:3008/api/docs` |
| `apps/shipping-service`     | 3009 | `shipping`     | `:3009/api/docs` |
| `apps/notification-service` | 3010 | `notification` | `:3010/api/docs` |
| `apps/refund-service`       | 3011 | `refund`       | `:3011/api/docs` |
| `apps/orchestrator-service` | 3012 | `orchestrator` | `:3012/api/docs` |


> Tất cả FE request đi qua API Gateway (`localhost:3002`). Gateway forward đến service tương ứng và validate JWT.

---

## 5. User Stories & Acceptance Criteria

### Epic 1: Authentication

---

#### US-101: Đăng nhập bằng email và password

> **As a** user,  
> **I want** to log in with my email and password,  
> **So that** I can access the application.

**Acceptance Criteria:**

```
AC-101-1: Đăng nhập thành công
  Given user nhập email và password hợp lệ
  When user submit form login
  Then hệ thống trả về accessToken (expire 5 phút) và refreshToken (expire 1 ngày)
  And user được redirect về trang Product List
  And accessToken được lưu trong memory (React state / context)
  And refreshToken được lưu trong httpOnly cookie

AC-101-2: Đăng nhập thất bại — sai password
  Given user nhập email đúng nhưng password sai
  When user submit form login
  Then hệ thống trả về lỗi 401 "Email hoặc mật khẩu không đúng"
  And user vẫn ở trang login

AC-101-3: Đăng nhập thất bại — email không tồn tại
  Given user nhập email không có trong hệ thống
  When user submit form login
  Then hệ thống trả về lỗi 401 "Email hoặc mật khẩu không đúng"
  And không tiết lộ email có tồn tại hay không (security)

AC-101-4: Validation form
  Given user để trống email hoặc password
  When user submit form
  Then frontend hiển thị lỗi validation ngay tại field (Zod + React Hook Form)
  And không gửi request lên server

AC-101-5: Password field ẩn
  Given user đang nhập password
  Then mặc định input type="password"
  And có nút toggle để show/hide password
```

---

#### US-102: Tự động refresh access token

> **As a** logged-in user,  
> **I want** my session to be automatically renewed,  
> **So that** I don't get logged out while actively using the app.

**Acceptance Criteria:**

```
AC-102-1: Silent refresh
  Given accessToken đã hết hạn (5 phút)
  When user gửi request bất kỳ
  Then TanStack Query interceptor tự động gọi POST /auth/refresh
  And dùng refreshToken trong cookie
  And nhận accessToken mới
  And retry request gốc với accessToken mới
  And user không nhận thấy gián đoạn

AC-102-2: Refresh token hết hạn
  Given cả accessToken và refreshToken đều hết hạn (> 1 ngày không dùng)
  When user truy cập app
  Then user được redirect về trang login
  And hiển thị thông báo "Phiên làm việc đã hết hạn, vui lòng đăng nhập lại"

AC-102-3: Rotate refresh token
  Given user dùng refreshToken để lấy accessToken mới
  When refresh thành công
  Then server issue refreshToken MỚI và invalidate token cũ
  And nếu ai đó dùng refreshToken cũ → trả về 401 (token reuse detection)
```

---

#### US-103: Đăng xuất

> **As a** logged-in user,  
> **I want** to log out,  
> **So that** my session is securely terminated.

**Acceptance Criteria:**

```
AC-103-1: Đăng xuất thành công
  Given user đang đăng nhập
  When user click nút Logout
  Then gọi POST /auth/logout để revoke refreshToken trong DB
  And xóa accessToken khỏi memory
  And xóa refreshToken cookie
  And redirect về trang login

AC-103-2: Bảo vệ route
  Given user chưa đăng nhập (hoặc đã logout)
  When user truy cập bất kỳ route protected nào (/, /orders, /checkout, ...)
  Then redirect về /login
```

---

### Epic 2: Product Browsing

---

#### US-201: Xem danh sách sản phẩm

> **As a** logged-in user,  
> **I want** to see a list of products with their prices,  
> **So that** I can browse and choose what to buy.

**Acceptance Criteria:**

```
AC-201-1: Hiển thị product list
  Given user đã đăng nhập và vào trang /
  When trang load
  Then hiển thị danh sách tất cả sản phẩm (seed data)
  And mỗi product card có: tên, giá (VND format), ảnh, nút "Mua ngay"
  And giá format: "1.250.000 ₫"

AC-201-2: Sản phẩm hết hàng
  Given một sản phẩm có stock = 0
  When user xem product list
  Then nút "Mua ngay" bị disabled và có label "Hết hàng"
  And product card có overlay "Out of stock"

AC-201-3: Loading state
  Given trang đang fetch products
  Then hiển thị skeleton loader (ShadCN Skeleton)
  And không hiển thị error hoặc blank screen

AC-201-4: Error state
  Given API product-service không khả dụng
  When trang cố load products
  Then hiển thị error message và nút "Thử lại"
```

---

### Epic 3: Order Creation & Checkout

---

#### US-301: Mua ngay một sản phẩm

> **As a** logged-in user,  
> **I want** to buy a product immediately by clicking "Mua ngay",  
> **So that** I can quickly initiate the purchase flow.

**Acceptance Criteria:**

```
AC-301-1: Click "Mua ngay" → Checkout page
  Given user click nút "Mua ngay" trên product card
  When product còn hàng
  Then user được redirect sang /checkout?productId={id}
  And trang checkout hiển thị: product name, giá, quantity = 1

AC-301-2: Điền thông tin giao hàng
  Given user đang ở trang checkout
  Then form có các fields: Họ tên, Số điện thoại, Địa chỉ, Thành phố
  And tất cả fields đều required
  And Số điện thoại validate format VN (10 số bắt đầu 0)

AC-301-3: Submit checkout
  Given user điền đầy đủ thông tin hợp lệ
  When user click "Tiến hành thanh toán"
  Then gọi POST /orders với { productId, quantity: 1, shippingAddress }
  And hiển thị loading state trên button
  And khi thành công, redirect sang /payment/{orderId}

AC-301-4: Hết hàng khi checkout
  Given product bị hết hàng trong lúc user đang ở checkout form
  When user submit
  Then Order Service tạo order thành công (stock check xảy ra ở bước Inventory reservation trong saga)
  And người dùng vẫn bị redirect sang trang payment
  And Saga sẽ fail ở bước RESERVE_INVENTORY → compensation → cancel order → notify user

AC-301-5: Double submit protection
  Given user click "Tiến hành thanh toán"
  Then button bị disabled ngay lập tức
  And chỉ 1 request được gửi
```

---

#### US-302: Xem trang thanh toán QR

> **As a** user who just created an order,  
> **I want** to see a QR code for payment,  
> **So that** I can pay with VNPay within the time limit.

**Acceptance Criteria:**

```
AC-302-1: Hiển thị QR code
  Given order được tạo thành công
  When user vào /payment/{orderId}
  Then hiển thị QR code VNPay
  And hiển thị số tiền cần thanh toán
  And hiển thị countdown timer (15:00 → 0:00)

AC-302-2: Countdown timer
  Given trang payment đang hiển thị
  When countdown về 0
  Then hiển thị modal "Đã hết thời gian thanh toán"
  And QR code bị ẩn/disabled
  And có nút "Về trang sản phẩm"
  And background: Orchestrator nhận payment.timeout → cancel order + release stock

AC-302-3: Thanh toán thành công
  Given user đã quét QR và thanh toán trên VNPay
  When VNPay webhook gọi về payment-service
  And payment-service emit payment.completed
  And Notification service push WebSocket event về FE
  Then trang /payment/{orderId} tự động redirect sang /orders/{orderId}
  And hiển thị toast "Thanh toán thành công!"

AC-302-4: Polling fallback
  Given WebSocket không kết nối được
  When user đang ở trang payment
  Then TanStack Query poll GET /payment/{orderId}/status mỗi 5 giây
  And khi status = COMPLETED, redirect sang /orders/{orderId}

AC-302-5: Truy cập lại trang payment sau khi đã thanh toán
  Given order đã PAYMENT_RECEIVED
  When user truy cập lại /payment/{orderId}
  Then redirect về /orders/{orderId}
```

---

### Epic 4: Payment & Idempotency

---

#### US-401: Thanh toán qua VNPay QR

> **As a** system,  
> **I want** to process VNPay payments reliably,  
> **So that** each order is charged exactly once regardless of retries.

**Acceptance Criteria:**

```
AC-401-1: Tạo VNPay payment URL
  Given order tồn tại và status = PENDING_PAYMENT
  When Payment Service nhận lệnh tạo QR
  Then tạo VNPay payment URL với vnp_TxnRef = orderId
  And lưu PaymentIntent với idempotencyKey = orderId, status = PENDING
  And trả về QR URL cho FE

AC-401-2: Xử lý VNPay webhook (IPN)
  Given VNPay gọi webhook POST /payment/vnpay-webhook
  When vnp_ResponseCode = "00" (thành công)
  Then verify signature với HMAC-SHA512
  And check PaymentIntent với idempotencyKey = vnp_TxnRef
  And nếu status đã = COMPLETED → return { RspCode: "00" } ngay (idempotent)
  And nếu status = PENDING → update COMPLETED, emit payment.completed
  And response VNPay trong 2 giây (VNPay requirement)

AC-401-3: Xử lý duplicate webhook
  Given VNPay gửi cùng webhook 2 lần (vnp_TxnRef giống nhau)
  When Payment Service nhận webhook lần 2
  Then check vnp_TxnRef đã tồn tại trong DB
  And return { RspCode: "00" } mà không process lại
  And không emit event thứ 2

AC-401-4: Payment timeout
  Given order có paymentDeadline đã qua và status vẫn = PENDING_PAYMENT
  When Cron job chạy mỗi 1 phút
  Then emit payment.timeout event với orderId
  And Payment Service đánh dấu PaymentIntent = EXPIRED

AC-401-5: Invalid signature
  Given VNPay gọi webhook với signature không hợp lệ
  When Payment Service verify
  Then return { RspCode: "97" } (signature failed)
  And không xử lý payment
  And log warning với correlationId
```

---

### Epic 5: Order Management

---

#### US-501: Xem danh sách đơn hàng

> **As a** logged-in user,  
> **I want** to see all my orders,  
> **So that** I can track the status of my purchases.

**Acceptance Criteria:**

```
AC-501-1: Hiển thị order list
  Given user vào /orders
  When trang load
  Then hiển thị tất cả orders của user đăng nhập
  And mỗi row có: order ID (rút gọn), tên sản phẩm, giá, status badge, ngày tạo
  And sort theo createdAt DESC (mới nhất lên đầu)

AC-501-2: Status badge màu sắc
  PENDING_PAYMENT  → badge màu vàng
  PAYMENT_RECEIVED → badge màu xanh dương
  CONFIRMED        → badge màu xanh lá
  PREPARING        → badge màu cam
  SHIPPED          → badge màu tím
  DELIVERED        → badge màu xanh đậm
  CANCELLED        → badge màu đỏ
  REFUND_REQUESTED → badge màu cam đậm
  REFUNDED         → badge màu xám

AC-501-3: Empty state
  Given user chưa có order nào
  Then hiển thị "Bạn chưa có đơn hàng nào" với nút "Khám phá sản phẩm"
```

---

#### US-502: Xem chi tiết đơn hàng

> **As a** logged-in user,  
> **I want** to see the full details of an order,  
> **So that** I can track every step of my order's progress.

**Acceptance Criteria:**

```
AC-502-1: Hiển thị thông tin đơn hàng
  Given user vào /orders/{orderId}
  Then hiển thị:
    - Order ID, ngày tạo
    - Tên sản phẩm, số lượng, đơn giá, tổng tiền
    - Địa chỉ giao hàng
    - Status hiện tại
    - Tracking ID (nếu đã SHIPPED)

AC-502-2: Order status timeline
  Given order có status bất kỳ
  Then hiển thị timeline các bước:
    [Tạo đơn] → [Thanh toán] → [Xác nhận] → [Đóng gói] → [Vận chuyển] → [Đã giao]
  And bước đã hoàn thành có icon check màu xanh
  And bước hiện tại có icon đang chạy (animated)
  And bước chưa tới có màu xám

AC-502-3: Order bị cancel
  Given order status = CANCELLED
  Then timeline hiển thị bước cuối là [Đã hủy] màu đỏ
  And hiển thị lý do cancel (nếu có)

AC-502-4: Nút "Yêu cầu Hoàn tiền"
  Given order status = DELIVERED
  And thời gian từ deliveredAt đến hiện tại <= 7 ngày
  And chưa có refund request
  Then hiển thị nút "Yêu cầu Hoàn tiền"

  Given order status = DELIVERED nhưng đã quá 7 ngày
  Then không hiển thị nút refund, hiển thị text "Đã hết thời hạn yêu cầu hoàn tiền"

AC-502-5: Real-time update
  Given user đang xem /orders/{orderId}
  When WebSocket nhận event order.status_updated với orderId trùng khớp
  Then TanStack Query tự động invalidate và refetch order data
  And timeline cập nhật mà không cần reload page
```

---

### Epic 6: Refund

---

#### US-601: Yêu cầu hoàn tiền

> **As a** user whose order has been delivered,  
> **I want** to submit a refund request with evidence files,  
> **So that** I can get my money back if there's an issue.

**Acceptance Criteria:**

```
AC-601-1: Form refund
  Given user vào /orders/{orderId}/refund
  Then hiển thị form có:
    - Textarea "Lý do hoàn tiền" (required, min 20 ký tự)
    - File upload zone (drag & drop hoặc click)
    - Nút submit

AC-601-2: File upload validation (Frontend)
  Given user upload file
  Then chỉ chấp nhận: .jpg, .jpeg, .png
  And mỗi file tối đa 5MB
  And tối đa 3 files
  And hiển thị preview thumbnail cho mỗi file
  And có nút xóa từng file

AC-601-3: Submit refund request
  Given user điền lý do và upload ít nhất 1 file
  When user click "Gửi yêu cầu"
  Then gọi POST /refund (multipart/form-data)
  And files được upload lên MinIO
  And tạo RefundRequest với status = REFUND_PENDING
  And redirect về /orders/{orderId} với toast "Yêu cầu hoàn tiền đã được gửi"

AC-601-4: Duplicate request prevention
  Given order đã có refund request (mọi status)
  When user cố truy cập /orders/{orderId}/refund
  Then redirect về /orders/{orderId}
  And hiển thị trạng thái refund hiện tại

AC-601-5: Validation window
  Given deliveredAt đã quá 7 ngày
  When user POST /refund
  Then API trả về 400 "Đã hết thời hạn yêu cầu hoàn tiền (7 ngày)"
```

---

#### US-602: Hệ thống tự động xét duyệt refund

> **As a** system,  
> **I want** to automatically validate refund requests,  
> **So that** legitimate refunds are processed without manual intervention.

**Acceptance Criteria:**

```
AC-602-1: Auto-validation (V1 mock logic)
  Given RefundRequest được tạo với files hợp lệ
  When Refund Service chạy validation
  Then check:
    - Tất cả files đọc được (không bị corrupt)
    - reason.length >= 20 ký tự
    - Files đúng format (jpg/png/jpeg)
  And nếu tất cả pass → status = REFUND_APPROVED
  And nếu fail → status = REFUND_REJECTED với reviewNote cụ thể

AC-602-2: REFUND_APPROVED → Payment Service hoàn tiền
  Given RefundRequest status = REFUND_APPROVED
  When Orchestrator nhận event
  Then emit lệnh payment.refund_requested đến Payment Service
  And Payment Service thực hiện refund qua VNPay (mock: luôn thành công)
  And emit payment.refunded
  And Orchestrator update order status = REFUNDED
  And update RefundRequest status = REFUNDED

AC-602-3: REFUND_REJECTED
  Given RefundRequest validation fail
  Then status = REFUND_REJECTED
  And reviewNote có lý do cụ thể
  And order status KHÔNG thay đổi (vẫn là DELIVERED)
  And user nhận email thông báo bị từ chối kèm lý do

AC-602-4: User xem kết quả refund
  Given user vào /orders/{orderId} sau khi refund được xử lý
  Then hiển thị RefundStatus badge
  And nếu REFUND_REJECTED: hiển thị reviewNote
  And nếu REFUNDED: hiển thị "Đã hoàn tiền thành công"
```

---

### Epic 7: Notifications

---

#### US-701: Nhận email thông báo theo từng sự kiện

> **As a** user,  
> **I want** to receive emails at each important stage of my order,  
> **So that** I'm always informed about my order status.

**Acceptance Criteria:**

```
AC-701-1: Email triggers và nội dung
  Trigger                  | Template              | Nội dung bắt buộc
  -------------------------|----------------------|-----------------------------
  Order created            | order-created         | OrderID, Product, Amount, Deadline
  Payment success          | payment-success       | OrderID, Amount, Timestamp
  Order confirmed          | order-confirmed       | OrderID, "Đang chuẩn bị hàng"
  Shipped                  | order-shipped         | OrderID, TrackingID
  Delivered                | order-delivered       | OrderID, Hướng dẫn refund 7 ngày
  Refund approved          | refund-approved       | OrderID, "Đang xử lý hoàn tiền"
  Refund rejected          | refund-rejected       | OrderID, ReviewNote (lý do)
  Refund completed         | refund-completed      | OrderID, Amount refunded
  Order cancelled          | order-cancelled       | OrderID, Reason

AC-701-2: Email gửi đến đúng địa chỉ
  Given user có email đăng ký
  When email trigger event xảy ra
  Then email gửi đến email của user đó, không phải user khác

AC-701-3: Idempotency
  Given Notification Service nhận cùng một event 2 lần (Kafka duplicate)
  When xử lý event thứ 2
  Then check eventId đã được xử lý chưa
  And không gửi email trùng
```

---

#### US-702: Nhận real-time notification qua WebSocket

> **As a** logged-in user,  
> **I want** to receive real-time updates in the browser,  
> **So that** my order status updates automatically without refreshing.

**Acceptance Criteria:**

```
AC-702-1: Kết nối WebSocket sau login
  Given user đăng nhập thành công
  When app load
  Then tự động kết nối Socket.io tới /notifications namespace
  And authenticate bằng JWT trong handshake

AC-702-2: Nhận order.status_updated event
  Given user đang ở bất kỳ trang nào trong app
  When server emit order.status_updated với orderId của user
  Then hiển thị toast notification: "Đơn hàng #{orderId} đã cập nhật: {newStatus}"
  And nếu user đang ở /orders/{orderId}, tự động refetch order data

AC-702-3: Notification toast
  Given socket nhận event notification.new
  Then hiển thị toast ở góc phải trên
  And toast tự dismiss sau 5 giây
  And có thể click để navigate đến order liên quan

AC-702-4: Reconnect tự động
  Given WebSocket bị disconnect (network issue)
  When connection drop
  Then Socket.io client tự reconnect với exponential backoff
  And khi reconnect thành công, user nhận lại các update
```

---

### Epic 8: System — Saga & Resilience

---

#### US-801: Orchestrator điều phối Order Saga

> **As a** system,  
> **I want** the Orchestrator to manage each saga step reliably,  
> **So that** the order flow completes correctly or rolls back cleanly.

**Acceptance Criteria:**

```
AC-801-1: Saga được khởi tạo đúng
  Given Order Service emit order.created
  When Orchestrator nhận event
  Then tạo SagaInstance với sagaType = "ORDER_SAGA", status = RUNNING
  And tạo SagaStep đầu tiên: RESERVE_INVENTORY, status = IN_PROGRESS
  And emit inventory.reserve_stock command

AC-801-2: Saga step thành công → chuyển step tiếp theo
  Given Orchestrator đang chờ inventory.stock_reserved
  When Inventory Service emit inventory.stock_reserved
  Then update SagaStep RESERVE_INVENTORY = COMPLETED
  And tạo SagaStep tiếp theo: AWAIT_PAYMENT, status = IN_PROGRESS
  And emit payment.qr_requested (hoặc chờ payment.completed)

AC-801-3: Saga step timeout
  Given Orchestrator đang chờ response từ một service
  When 30 giây trôi qua mà không có response
  Then retry command (tối đa 3 lần, backoff: 1s, 3s, 9s)
  And sau 3 lần timeout → trigger compensation

AC-801-4: Saga retry với idempotency
  Given Orchestrator retry command RESERVE_INVENTORY lần 2
  When Inventory Service nhận command với sagaId đã xử lý
  Then Inventory Service phát hiện duplicate qua sagaId
  And return response như đã xử lý trước đó (idempotent)
  And không reserve stock thêm lần nữa

AC-801-5: Saga hoàn thành
  Given tất cả 5 steps hoàn thành (RESERVE → PAYMENT → CONFIRM → SHIPPING → COMPLETE)
  Then SagaInstance status = COMPLETED
  And Order status = DELIVERED
  And log saga completion với sagaId, orderId, duration
```

---

#### US-802: Compensation (Rollback) khi Saga fail

> **As a** system,  
> **I want** compensation transactions to run automatically on failure,  
> **So that** the system returns to a consistent state.

**Acceptance Criteria:**

```
AC-802-1: Compensation khi inventory không đủ hàng
  Given Orchestrator emit inventory.reserve_stock
  When Inventory Service emit inventory.stock_insufficient
  Then Orchestrator KHÔNG chuyển sang bước tiếp theo
  And update SagaStep RESERVE_INVENTORY = FAILED
  And emit order.cancel command
  And emit notification.send (order_cancelled, reason: "Sản phẩm hết hàng")
  And SagaInstance status = COMPENSATED

AC-802-2: Compensation khi payment timeout
  Given order đang ở bước AWAIT_PAYMENT
  When payment.timeout event đến
  Then emit inventory.release_stock (compensation)
  And chờ inventory.stock_released
  And emit order.cancel command
  And emit notification.send (order_cancelled, reason: "Hết thời gian thanh toán")
  And SagaInstance status = COMPENSATED

AC-802-3: Compensation khi payment fail
  Given Orchestrator nhận payment.failed
  When bất kỳ bước nào sau RESERVE_INVENTORY đã hoàn thành
  Then chạy compensation theo thứ tự ngược lại
  And emit inventory.release_stock
  And nếu đã charge tiền → emit payment.refund_requested
  And emit order.cancel command
  And SagaInstance status = COMPENSATED

AC-802-4: Compensation idempotent
  Given compensation command bị gửi 2 lần (retry)
  When service nhận compensation lần 2
  Then check sagaId + operation đã xử lý chưa
  And return success mà không thay đổi state

AC-802-5: DLQ sau 3 lần retry thất bại
  Given một compensation step fail 3 lần liên tiếp
  Then message được chuyển vào DLQ topic của service đó
  And SagaInstance status = FAILED (không phải COMPENSATED)
  And log ERROR với sagaId, step, reason để manual intervention
```

---

#### US-803: Outbox Pattern đảm bảo event delivery

> **As a** system,  
> **I want** events to be published reliably even if Kafka is temporarily down,  
> **So that** no events are lost due to infrastructure issues.

**Acceptance Criteria:**

```
AC-803-1: Outbox write trong cùng transaction
  Given service cần publish event
  When service update business data
  Then insert OutboxEvent và update business data trong CÙNG một DB transaction
  And nếu transaction fail → cả 2 đều rollback, không có orphan event

AC-803-2: Background worker publish
  Given OutboxEvent với published = false tồn tại
  When worker chạy mỗi 5 giây
  Then fetch tất cả unpublished events
  And publish lên Kafka
  And đánh dấu published = true

AC-803-3: Kafka down
  Given Kafka đang down khi worker chạy
  When worker cố publish
  Then log error và retry lần tiếp theo (không crash app)
  And events giữ nguyên published = false cho đến khi Kafka recover

AC-803-4: Idempotency với eventId
  Given Kafka consumer nhận cùng event 2 lần (Kafka at-least-once)
  When consumer xử lý event
  Then check eventId đã được xử lý chưa trong local DB
  And skip nếu đã xử lý
```

---

## 6. API Contracts

### 6.1 Auth Service (`/api/auth`)

```
POST   /login                   Body: {email, password}
                                Res:  {accessToken, refreshToken, user:{id,email}}

POST   /refresh                 Body: {refreshToken}
                                Res:  {accessToken, refreshToken}

POST   /logout                  Header: Bearer token
                                Res:  204 No Content
```

### 6.2 Product Service (`/api/products`)

```
GET    /                        Res: {data: Product[], total: number}
GET    /:id                     Res: Product
```

### 6.3 Order Service (`/api/orders`)

```
POST   /                        Header: Bearer
                                Body: {productId, quantity, shippingAddress}
                                Res:  {orderId, totalAmount, paymentDeadline}

GET    /                        Header: Bearer
                                Res:  {data: Order[]}

GET    /:id                     Header: Bearer
                                Res:  Order (full detail)

PATCH  /:id/status              Internal only (service-to-service)
                                Body: {status, reason?}
```

### 6.4 Payment Service (`/api/payment`)

```
POST   /create-qr               Internal: Body: {orderId, amount}
                                Res:  {qrUrl, paymentIntentId, expiresAt}

POST   /vnpay-webhook           Public (VNPay calls this)
                                Body: VNPay IPN payload
                                Res:  {RspCode: "00"|"97"|"99"}

GET    /:orderId/status          Header: Bearer
                                Res:  {status: PaymentStatus}

POST   /refund                  Internal: Body: {orderId, amount, reason}
                                Res:  {success: boolean}
```

### 6.5 Refund Service (`/api/refund`)

```
POST   /                        Header: Bearer
                                Body: multipart/form-data
                                      {orderId, reason, files[]: File}
                                Res:  {refundId, status: "REFUND_PENDING"}

GET    /:orderId                 Header: Bearer
                                Res:  RefundRequest | null
```

### 6.6 Swagger

Mỗi service expose Swagger UI tại `/api/docs`. Enabled khi `SWAGGER_ENABLED=true`.

---

## 7. Database Schemas

Mỗi service dùng TypeORM với entities. Schema PostgreSQL được set qua `@Entity({ schema: '...' })` và config trong `TypeOrmModule.forRoot({ schema: '...' })`.

Migration: `pnpm --filter <service> migration:generate -- src/database/migrations/<Name>`

### 7.1 Auth Service

```typescript
// user.entity.ts
@Entity({ schema: 'auth' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => RefreshToken, (t) => t.user)
  tokens: RefreshToken[];
}

// refresh-token.entity.ts
@Entity({ schema: 'auth' })
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  token: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (u) => u.tokens)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  expiresAt: Date;

  @Column({ nullable: true, type: 'timestamptz' })
  revokedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
```

### 7.2 Product Service

```typescript
// product.entity.ts
@Entity({ schema: 'product' })
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ nullable: true })
  imageUrl: string | null;

  @Column({ default: 0 })
  stock: number;

  @CreateDateColumn()
  createdAt: Date;
}
```

### 7.3 Order Service

```typescript
// enums/order-status.enum.ts
export enum OrderStatus {
  PENDING_PAYMENT  = 'PENDING_PAYMENT',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  CONFIRMED        = 'CONFIRMED',
  PREPARING        = 'PREPARING',
  SHIPPED          = 'SHIPPED',
  DELIVERED        = 'DELIVERED',
  CANCELLED        = 'CANCELLED',
  REFUND_REQUESTED = 'REFUND_REQUESTED',
  REFUNDED         = 'REFUNDED',
}

// order.entity.ts
@Entity({ schema: 'orders' })
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  productId: string;

  @Column()
  productName: string;

  @Column()
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalAmount: number;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING_PAYMENT })
  status: OrderStatus;

  @Column({ type: 'jsonb' })
  shippingAddress: ShippingAddress;

  @Column()
  paymentDeadline: Date;

  @Column({ nullable: true })
  trackingId: string | null;

  @Column({ nullable: true, type: 'timestamptz' })
  deliveredAt: Date | null;

  @Column({ nullable: true, type: 'text' })
  cancelReason: string | null;

  @Column({ nullable: true, unique: true })
  sagaId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => OutboxEvent, (e) => e.order)
  outboxEvents: OutboxEvent[];
}

// outbox-event.entity.ts
@Entity({ schema: 'orders' })
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  aggregateId: string;

  @Column()
  eventType: string;

  @Column({ type: 'jsonb' })
  payload: object;

  @Column({ default: false })
  published: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Order, (o) => o.outboxEvents)
  @JoinColumn({ name: 'aggregateId' })
  order: Order;
}

// shipping-address.interface.ts
export interface ShippingAddress {
  fullName: string;
  phone: string;
  address: string;
  city: string;
}
```

### 7.4 Inventory Service

```typescript
// enums/reservation-status.enum.ts
export enum ReservationStatus {
  HELD      = 'HELD',
  CONFIRMED = 'CONFIRMED',
  RELEASED  = 'RELEASED',
}

// inventory-item.entity.ts
@Entity({ schema: 'inventory' })
export class InventoryItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  productId: string;

  @Column()
  totalStock: number;

  @Column({ default: 0 })
  reserved: number;

  @Column()
  available: number;

  @OneToMany(() => StockReservation, (r) => r.item)
  reservations: StockReservation[];
}

// stock-reservation.entity.ts
@Entity({ schema: 'inventory' })
@Unique(['sagaId', 'productId'])
export class StockReservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  productId: string;

  @Column()
  orderId: string;

  @Column()
  sagaId: string;

  @Column()
  quantity: number;

  @Column({ type: 'enum', enum: ReservationStatus, default: ReservationStatus.HELD })
  status: ReservationStatus;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => InventoryItem, (i) => i.reservations)
  @JoinColumn({ name: 'productId', referencedColumnName: 'productId' })
  item: InventoryItem;
}

// processed-event.entity.ts  — idempotency guard
@Entity({ schema: 'inventory' })
export class ProcessedEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  eventId: string;

  @CreateDateColumn()
  processedAt: Date;
}
```

### 7.5 Payment Service

```typescript
// enums/payment-status.enum.ts
export enum PaymentStatus {
  PENDING   = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED    = 'FAILED',
  EXPIRED   = 'EXPIRED',
  REFUNDED  = 'REFUNDED',
}

// payment-intent.entity.ts
@Entity({ schema: 'payment' })
export class PaymentIntent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  orderId: string;

  @Column({ unique: true })
  idempotencyKey: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ nullable: true, unique: true })
  vnpTxnRef: string | null;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ nullable: true, type: 'timestamptz' })
  paidAt: Date | null;

  @Column({ nullable: true, type: 'timestamptz' })
  refundedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => OutboxEvent, (e) => e.intent)
  outboxEvents: OutboxEvent[];
}

// processed-webhook.entity.ts  — VNPay IPN idempotency guard
@Entity({ schema: 'payment' })
export class ProcessedWebhook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  vnpTxnRef: string;

  @CreateDateColumn()
  processedAt: Date;
}

// outbox-event.entity.ts
@Entity({ schema: 'payment' })
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  aggregateId: string;

  @Column()
  eventType: string;

  @Column({ type: 'jsonb' })
  payload: object;

  @Column({ default: false })
  published: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => PaymentIntent, (p) => p.outboxEvents)
  @JoinColumn({ name: 'aggregateId' })
  intent: PaymentIntent;
}
```

### 7.6 Shipping Service

```typescript
// enums/shipment-status.enum.ts
export enum ShipmentStatus {
  PREPARING  = 'PREPARING',
  PICKED_UP  = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED  = 'DELIVERED',
  CANCELLED  = 'CANCELLED',
}

// shipment-record.entity.ts
@Entity({ schema: 'shipping' })
export class ShipmentRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  orderId: string;

  @Column()
  sagaId: string;

  @Column({ unique: true, default: () => 'gen_random_uuid()' })
  trackingId: string;

  @Column({ type: 'enum', enum: ShipmentStatus, default: ShipmentStatus.PREPARING })
  status: ShipmentStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### 7.7 Notification Service

```typescript
// notification-log.entity.ts
@Entity({ schema: 'notification' })
export class NotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ unique: true })
  eventId: string;

  @Column()
  type: string;

  @Column()
  channel: string;

  @Column({ type: 'jsonb' })
  payload: object;

  @Column({ default: 'SENT' })
  status: string;

  @CreateDateColumn()
  sentAt: Date;
}
```

### 7.8 Refund Service

```typescript
// enums/refund-status.enum.ts
export enum RefundStatus {
  REFUND_PENDING  = 'REFUND_PENDING',
  REFUND_APPROVED = 'REFUND_APPROVED',
  REFUND_REJECTED = 'REFUND_REJECTED',
  REFUNDED        = 'REFUNDED',
}

// refund-request.entity.ts
@Entity({ schema: 'refund' })
export class RefundRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  orderId: string;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'text', array: true, default: [] })
  fileUrls: string[];

  @Column({ type: 'enum', enum: RefundStatus, default: RefundStatus.REFUND_PENDING })
  status: RefundStatus;

  @Column({ nullable: true, type: 'text' })
  reviewNote: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => OutboxEvent, (e) => e.request)
  outboxEvents: OutboxEvent[];
}

// outbox-event.entity.ts
@Entity({ schema: 'refund' })
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  aggregateId: string;

  @Column()
  eventType: string;

  @Column({ type: 'jsonb' })
  payload: object;

  @Column({ default: false })
  published: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => RefundRequest, (r) => r.outboxEvents)
  @JoinColumn({ name: 'aggregateId' })
  request: RefundRequest;
}
```

### 7.9 Orchestrator Service

```typescript
// enums/saga-status.enum.ts
export enum SagaStatus {
  RUNNING      = 'RUNNING',
  COMPLETED    = 'COMPLETED',
  COMPENSATING = 'COMPENSATING',
  COMPENSATED  = 'COMPENSATED',
  FAILED       = 'FAILED',
}

// enums/saga-step-status.enum.ts
export enum SagaStepStatus {
  PENDING      = 'PENDING',
  IN_PROGRESS  = 'IN_PROGRESS',
  COMPLETED    = 'COMPLETED',
  FAILED       = 'FAILED',
  COMPENSATING = 'COMPENSATING',
  COMPENSATED  = 'COMPENSATED',
  SKIPPED      = 'SKIPPED',
}

// saga-instance.entity.ts
@Entity({ schema: 'orchestrator' })
export class SagaInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sagaType: string;

  @Column()
  orderId: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: SagaStatus, default: SagaStatus.RUNNING })
  status: SagaStatus;

  @Column()
  currentStep: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => SagaStep, (s) => s.saga)
  steps: SagaStep[];
}

// saga-step.entity.ts
@Entity({ schema: 'orchestrator' })
export class SagaStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sagaId: string;

  @Column()
  stepName: string;

  @Column({ type: 'enum', enum: SagaStepStatus, default: SagaStepStatus.PENDING })
  status: SagaStepStatus;

  @Column({ nullable: true })
  commandTopic: string | null;

  @Column({ nullable: true, type: 'jsonb' })
  payload: object | null;

  @Column({ nullable: true, type: 'jsonb' })
  result: object | null;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ nullable: true, type: 'text' })
  failedReason: string | null;

  @Column({ nullable: true, type: 'timestamptz' })
  startedAt: Date | null;

  @Column({ nullable: true, type: 'timestamptz' })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => SagaInstance, (s) => s.steps)
  @JoinColumn({ name: 'sagaId' })
  saga: SagaInstance;
}
```

---

## 8. Kafka Topics & Event Payloads

### 8.1 Base Event Schema

Mọi event đều wrap trong envelope này:

```typescript
interface KafkaEvent<T = unknown> {
  eventId: string;        // UUID — dùng cho idempotency
  eventType: string;      // VD: "inventory.stock_reserved"
  sagaId: string;
  orderId: string;
  userId: string;
  correlationId: string;  // Trace request xuyên suốt
  timestamp: string;      // ISO 8601
  payload: T;
}
```

### 8.2 Topic Registry


| Topic                          | Publisher            | Consumers                  | Loại    |
| ------------------------------ | -------------------- | -------------------------- | ------- |
| `order.created`                | Order                | Orchestrator               | Event   |
| `order.cancel`                 | Orchestrator         | Order                      | Command |
| `order.cancelled`              | Order                | Notification               | Event   |
| `order.status_updated`         | Order                | Notification               | Event   |
| `inventory.reserve_stock`      | Orchestrator         | Inventory                  | Command |
| `inventory.stock_reserved`     | Inventory            | Orchestrator               | Event   |
| `inventory.stock_insufficient` | Inventory            | Orchestrator               | Event   |
| `inventory.confirm_stock`      | Orchestrator         | Inventory                  | Command |
| `inventory.stock_confirmed`    | Inventory            | Orchestrator               | Event   |
| `inventory.release_stock`      | Orchestrator         | Inventory                  | Command |
| `inventory.stock_released`     | Inventory            | Orchestrator               | Event   |
| `payment.completed`            | Payment              | Orchestrator               | Event   |
| `payment.failed`               | Payment              | Orchestrator               | Event   |
| `payment.timeout`              | Payment              | Orchestrator               | Event   |
| `payment.refund_requested`     | Orchestrator         | Payment                    | Command |
| `payment.refunded`             | Payment              | Orchestrator, Notification | Event   |
| `shipping.create_label`        | Orchestrator         | Shipping                   | Command |
| `shipping.label_created`       | Shipping             | Orchestrator               | Event   |
| `shipping.status_updated`      | Shipping             | Order, Notification        | Event   |
| `shipping.delivered`           | Shipping             | Orchestrator               | Event   |
| `notification.send`            | Orchestrator, Refund | Notification               | Command |
| `refund.requested`             | Refund               | Orchestrator               | Event   |
| `refund.validated`             | Refund               | Orchestrator               | Event   |
| `refund.status_updated`        | Orchestrator         | Refund, Notification       | Command |
| `*.dlq`                        | Kafka (auto)         | Manual intervention        | DLQ     |


### 8.3 Key Payload Schemas

```typescript
// order.created
interface OrderCreatedPayload {
  orderId: string;
  userId: string;
  productId: string;
  quantity: number;
  totalAmount: number;
  shippingAddress: ShippingAddress;
  paymentDeadline: string;
}

// inventory.reserve_stock (command)
interface ReserveStockPayload {
  productId: string;
  quantity: number;
  sagaId: string;
  orderId: string;
}

// payment.completed
interface PaymentCompletedPayload {
  orderId: string;
  amount: number;
  vnpTxnRef: string;
  paidAt: string;
}

// payment.timeout
interface PaymentTimeoutPayload {
  orderId: string;
  expiredAt: string;
}

// shipping.status_updated
interface ShippingStatusUpdatedPayload {
  orderId: string;
  trackingId: string;
  status: "PREPARING" | "PICKED_UP" | "IN_TRANSIT" | "DELIVERED";
}

// notification.send (command)
interface SendNotificationPayload {
  userId: string;
  email: string;
  template: string;
  data: Record<string, unknown>;
  channels: ("email" | "socket")[];
}

// refund.validated
interface RefundValidatedPayload {
  refundId: string;
  orderId: string;
  approved: boolean;
  reviewNote?: string;
}
```

### 8.4 Partition Strategy

- **Partition key**: `orderId` — đảm bảo tất cả events của cùng 1 order xử lý theo thứ tự
- **Topic config** (local dev): 3 partitions, replication factor 1
- **Consumer group** per service: `{service-name}-group`

---

## 9. Saga Flows

### 9.1 Order Saga — Happy Path

```
[START] Order Service emit order.created
   │
   ▼
[Step 1] RESERVE_INVENTORY
   Command → inventory.reserve_stock
   Wait   ← inventory.stock_reserved
   OnFail → COMPENSATE: cancel order, notify user
   │
   ▼
[Step 2] AWAIT_PAYMENT
   (QR URL đã được tạo khi Order Service tạo order)
   Wait   ← payment.completed
   OnTimeout(15min) → COMPENSATE: release stock, cancel order, notify user
   OnFail → COMPENSATE: release stock, cancel order, notify user
   │
   ▼
[Step 3] CONFIRM_INVENTORY
   Command → inventory.confirm_stock
   Wait   ← inventory.stock_confirmed
   OnFail → COMPENSATE: refund payment, release stock, cancel order, notify user
   │
   ▼
[Step 4] CREATE_SHIPPING
   Command → shipping.create_label
   Wait   ← shipping.label_created
   OnFail → COMPENSATE: refund payment, release stock, cancel order, notify user
   │
   ▼
[Step 5] AWAIT_DELIVERY (passive — wait for shipping.delivered)
   Wait   ← shipping.delivered
   │
   ▼
[Step 6] COMPLETE_ORDER
   Command → order.status_updated (DELIVERED)
   Notify  → notification.send (order_delivered)
   │
   ▼
[END] SagaInstance.status = COMPLETED
```

### 9.2 Compensation Matrix


| Step khi fail           | Release Stock | Refund Payment | Cancel Order | Notify |
| ----------------------- | ------------- | -------------- | ------------ | ------ |
| RESERVE_INVENTORY       | —             | —              | ✅            | ✅      |
| AWAIT_PAYMENT (timeout) | ✅             | —              | ✅            | ✅      |
| AWAIT_PAYMENT (fail)    | ✅             | —              | ✅            | ✅      |
| CONFIRM_INVENTORY       | ✅             | ✅*             | ✅            | ✅      |
| CREATE_SHIPPING         | ✅             | ✅              | ✅            | ✅      |


> *Refund chỉ xảy ra nếu `payment.completed` đã được nhận trước đó.

### 9.3 Refund Saga Flow

```
[START] Refund Service emit refund.requested
   │
   ▼
[Step 1] VALIDATE_REFUND
   Refund Service tự validate (async)
   Emit ← refund.validated {approved: true/false}
   │
   ├─ approved = true ──►
   │                    [Step 2] PROCESS_REFUND
   │                       Command → payment.refund_requested
   │                       Wait   ← payment.refunded
   │                       │
   │                       ▼
   │                    [Step 3] COMPLETE_REFUND
   │                       Command → order.status = REFUNDED
   │                       Command → refund.status = REFUNDED
   │                       Notify  → notification.send (refund_completed)
   │                       │
   │                       ▼
   │                    [END] SagaInstance.status = COMPLETED
   │
   └─ approved = false ──►
                        [Step 2] REJECT_REFUND
                           Command → refund.status = REFUND_REJECTED
                           Notify  → notification.send (refund_rejected)
                           │
                           ▼
                        [END] SagaInstance.status = COMPLETED
```

### 9.4 Retry & Timeout Policy


| Parameter            | Value                                                  |
| -------------------- | ------------------------------------------------------ |
| Max retry per step   | 3                                                      |
| Backoff schedule     | 1s → 3s → 9s                                           |
| Step timeout         | 30 giây                                                |
| Sau 3 lần retry fail | Message → DLQ, SagaStep = FAILED, trigger compensation |
| Payment step timeout | 15 phút (business rule)                                |


---

## 10. Outbox Pattern

### 10.1 Flow

```
Service nhận request
   │
   ▼
BEGIN TRANSACTION
   ├─ Update business table (e.g., Order.status)
   └─ INSERT OutboxEvent {eventType, payload, published: false}
COMMIT TRANSACTION
   │
   ▼
Background Worker — dùng @nestjs/schedule (@Cron every 5 giây)
   │   @Cron('*/5 * * * * *')
   │   async publishOutboxEvents() { ... }
   │
   ├─ SELECT * FROM outbox WHERE published = false ORDER BY createdAt LIMIT 100
   ├─ FOR EACH event:
   │     ├─ Publish to Kafka
   │     └─ UPDATE published = true
   └─ Log errors nếu Kafka down (không crash, retry lần chạy tiếp theo)
```

### 10.2 Services có Outbox

- Order Service
- Payment Service
- Inventory Service
- Refund Service

> Notification Service không cần outbox — chỉ consume và send, không cần đảm bảo publish.

---

## 11. Frontend Pages & Components

### 11.1 Route Map


| Route                     | Component         | Auth | Mô tả                        |
| ------------------------- | ----------------- | ---- | ---------------------------- |
| `/login`                  | `LoginPage`       | No   | Form đăng nhập               |
| `/`                       | `ProductListPage` | Yes  | Grid các sản phẩm            |
| `/checkout`               | `CheckoutPage`    | Yes  | Form địa chỉ + order summary |
| `/payment/:orderId`       | `PaymentPage`     | Yes  | QR code + countdown          |
| `/orders`                 | `OrderListPage`   | Yes  | Danh sách đơn hàng           |
| `/orders/:orderId`        | `OrderDetailPage` | Yes  | Chi tiết + timeline          |
| `/orders/:orderId/refund` | `RefundPage`      | Yes  | Form upload + lý do          |


### 11.2 Shared Components


| Component           | Mô tả                                      |
| ------------------- | ------------------------------------------ |
| `ProductCard`       | Tên, giá, ảnh, nút Mua ngay / Hết hàng     |
| `OrderStatusBadge`  | Colored badge theo OrderStatus             |
| `OrderTimeline`     | Step-by-step progress indicator            |
| `CountdownTimer`    | Đếm ngược 15 phút, đổi màu khi < 2 phút    |
| `QRCodeDisplay`     | Hiển thị QR image từ VNPay URL             |
| `FileUploadZone`    | Drag & drop, preview, validate type/size   |
| `NotificationToast` | WebSocket-triggered toast, auto-dismiss 5s |
| `ProtectedRoute`    | HOC redirect về /login nếu chưa auth       |


### 11.3 Data Fetching Strategy

- TanStack Query với staleTime phù hợp
- WebSocket event → `queryClient.invalidateQueries(['order', orderId])`
- Fallback polling: payment status mỗi 5 giây khi socket không có
- Optimistic update không dùng (tránh phức tạp với distributed state)

---

## 12. Error Handling & Resilience

### 12.1 Global Exception Filter (mọi service)

```typescript
// Response format chuẩn
{
  "statusCode": 400,
  "message": "Không đủ stock cho sản phẩm này",
  "errorCode": "INVENTORY_INSUFFICIENT",
  "correlationId": "uuid-v4",
  "sagaId": "uuid-v4",    // nếu có
  "timestamp": "2026-05-30T10:00:00Z"
}
```

### 12.2 Structured Logging (pino)

Mỗi log entry có:

```json
{
  "level": "info",
  "service": "inventory-service",
  "correlationId": "...",
  "sagaId": "...",
  "orderId": "...",
  "step": "RESERVE_INVENTORY",
  "message": "Stock reserved successfully",
  "timestamp": "..."
}
```

### 12.3 Circuit Breaker (opossum)

- Áp dụng cho: HTTP calls giữa services (nếu có direct call)
- Threshold: 50% failure rate trong 10 giây
- Half-open: thử 1 request sau 30 giây
- Fallback: trả về lỗi 503 với message rõ ràng

### 12.4 Kafka Consumer Retry

```typescript
// Consumer config per service
{
  retry: {
    initialRetryTime: 1000,    // 1s
    retries: 3,
    factor: 3,                 // backoff multiplier: 1s, 3s, 9s
  }
}
```

### 12.5 Bắt buộc implement (5 services)

Services **bắt buộc** có đầy đủ resilience patterns: Orchestrator, Order, Payment, Inventory, Refund.

---

## 13. Development Phases & Checklist

### Phase 1 — Foundation ✅ DONE

**Goal**: Auth và Product Service hoạt động, FE login và xem sản phẩm được.

**Backend:**

- [x] `auth-service`: Login, JWT (5m/1d), refresh rotation, logout, seed `test@nextmart.com`
- [x] `auth-service`: `cookie-parser`, login/refresh set `httpOnly cookie`, refresh đọc từ `req.cookies`
- [x] `product-service`: GET /products, GET /products/:id, seed 15 sản phẩm
- [x] `api-gateway`: Routes seeded (`auth*`, `products*`), `TransformInterceptor` removed (proxy không re-wrap)

**Frontend:**

- [x] `AuthProvider` — silent refresh khi app mount, show `LoadingScreen` trong lúc chờ
- [x] `LoadingScreen` component trong `packages/ui`
- [x] ProtectedRoute layout (`app/(protected)/layout.tsx`)
- [x] `/login` page: form, Zod validation, Zustand in-memory accessToken
- [x] `/products` page: ProductCard grid, loading skeleton, error state + retry
- [x] Session store: chỉ `accessToken` in-memory, `refreshToken` sống trong httpOnly cookie
- [x] `http-instance`: 401 → `POST /api/auth/refresh` (no body, `withCredentials: true`) → retry

**Decisions thực tế:**

- Product list route: `/products` thay vì `/` (tránh Next.js route group conflict)
- F5 → `AuthProvider` tự động silent refresh qua cookie → không cần login lại

**Verify:**

- [x] Login thành công → redirect về `/products`
- [x] Unauthenticated → redirect về `/login`
- [x] F5 → silent refresh → vào thẳng `/products` không bị kick về login
- [x] Gateway double-wrap fix: bỏ `TransformInterceptor` khỏi gateway

---

### Phase 2 — Core Order Flow (Week 2-3)

**Goal**: Happy path hoàn chỉnh: mua hàng → thanh toán QR → nhận email xác nhận.

**Backend:**

- `order-service`: POST /orders, GET /orders, GET /orders/:id, TypeOrm schema + Outbox
- `inventory-service`: Reserve/Confirm/Release với Redlock, idempotency, Swagger
- `payment-service`: Tạo VNPay QR URL, webhook IPN, idempotency, payment timeout cron, Outbox, Swagger
- `orchestrator-service`: SagaInstance/Step schema, happy path 5 steps, Saga log, Swagger
- `notification-service`: Email (MailPit) cho 4 triggers: order_created, payment_success, order_confirmed, order_shipped, Socket.io setup
- `shipping-service`: Mock label creation, mock tracking update timer (30s per step), Swagger
- Kafka topics setup: tất cả topics trong section 8.2
- Outbox worker: Order, Payment service

**Frontend:**

- `/checkout` page: form address + order summary
- `/payment/:orderId` page: QR display, countdown 15 phút, WebSocket listener, polling fallback
- Socket.io client setup, toast notifications
- `/orders` page: list với status badge
- `/orders/:orderId` page: OrderTimeline component

**Verify:**

- Happy path end-to-end: Login → Mua → QR → Webhook → Saga complete → Email nhận được trong MailPit
- Payment timeout: countdown hết → order cancel → stock release → email cancel
- Duplicate VNPay webhook không gây duplicate charge

---

### Phase 3 — Resilience & Refund (Week 4)

**Goal**: Compensation flows, refund, DLQ, full error handling, WebSocket real-time.

**Backend:**

- `orchestrator-service`: Compensation flows cho tất cả failure cases (section 9.2)
- `refund-service`: Upload MinIO, auto-validation logic, Outbox, Refund Saga, Swagger
- `notification-service`: Remaining email triggers (delivered, refund_approved, refund_rejected, refunded, cancelled), WebSocket push events
- DLQ consumer (logging + alert) cho tất cả services
- Circuit Breaker với opossum
- Structured logging với pino + correlationId middleware
- Global Exception Filter chuẩn hóa cho tất cả 5 services bắt buộc
- Outbox worker: Inventory, Refund service

**Frontend:**

- `/orders/:orderId` cập nhật: hiển thị refund button logic, refund status
- `/orders/:orderId/refund` page: FileUploadZone, drag & drop, preview
- Real-time: WebSocket nhận order status update → invalidate query → timeline tự cập nhật

**Verify:**

- Inventory insufficient → order cancel → email → UI cập nhật
- Refund approved flow: upload → validate → refund → email → UI update
- Refund rejected: sai file type (kiểm tra FE) và reason < 20 ký tự
- Saga retry 3 lần → DLQ → log FAILED
- Compensation idempotent: gửi release_stock 2 lần → chỉ release 1 lần

---

## 14. Environment Variables

### Common (tất cả NestJS services)

```env
NODE_ENV=development
DB_HOST=localhost
DB_PORT=1111
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=api-gateway-db
REDIS_HOST=localhost
REDIS_PORT=1112
KAFKA_BROKERS=localhost:1115
SWAGGER_ENABLED=true
LOG_LEVEL=debug
```

### Auth Service

```env
DB_SCHEMA=auth
JWT_ACCESS_SECRET=your-access-secret-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars
JWT_ACCESS_EXPIRES=5m
JWT_REFRESH_EXPIRES=1d
```

### Payment Service

```env
DB_SCHEMA=payment
VNPAY_TMN_CODE=<sandbox_tmn_code>
VNPAY_HASH_SECRET=<sandbox_hash_secret>
VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=http://localhost:3000/payment/callback
VNPAY_IPN_URL=http://localhost:3008/api/payment/vnpay-webhook
PAYMENT_TIMEOUT_MINUTES=15
```

### Notification Service

```env
DB_SCHEMA=notification
MAIL_HOST=localhost
MAIL_PORT=1113
MAIL_FROM=noreply@nextmart.local
```

### Refund Service

```env
DB_SCHEMA=refund
MINIO_ENDPOINT=localhost
MINIO_PORT=1117
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=refund-files
REFUND_WINDOW_DAYS=7
MAX_FILE_SIZE_MB=5
```

### Frontend (`.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:3002
NEXT_PUBLIC_WS_URL=http://localhost:3010
```

---

## 15. Decisions Log

Các quyết định đã được chốt:

| # | Quyết định | Chi tiết |
|---|---|---|
| 1 | **JWT storage** | `accessToken` → Zustand in-memory (không persist). `refreshToken` → httpOnly cookie. App init → gọi silent refresh để lấy lại accessToken nếu cookie còn hạn |
| 2 | **WebSocket** | Socket.io với NestJS `@WebSocketGateway` built-in |
| 3 | **Shipping mock interval** | Config qua env `MOCK_SHIPPING_INTERVAL_MS` |
| 4 | **AI Refund Validation V1** | Approve nếu: ít nhất 1 file hợp lệ + `reason.length >= 20`. Reject kèm lý do cụ thể |
| 5 | **Seed user** | `test@nextmart.com` / `Test@123` |


