# Saga Patterns Study Cases #1

> Tổng hợp các khái niệm và case study về Saga Pattern từ quá trình thiết kế hệ thống NextMart.

---

## 1. Saga Pattern là gì?

**Saga** = một cách quản lý **distributed transactions** trong microservices mà không dùng traditional ACID transactions (vì không thể across databases).

Thay vì một transaction toàn cục, Saga chia workflow thành nhiều **local transactions** ở các services khác nhau. Nếu một bước fail, saga sẽ chạy **compensation** (undo) những bước đã thành công.

```
Order → Inventory → Payment → Shipping
(mỗi cái là 1 local transaction)

Nếu Payment fail:
  ↓
Compensation:
  Shipping: cancel_label
  Inventory: release_stock
  Order: mark_cancelled
```

---

## 2. Orchestrator Saga (Sequential)

### Định nghĩa

Có một **Orchestrator Service** (service trung tâm) quyết định flow. Orchestrator gọi từng service, chờ kết quả, rồi quyết định step tiếp theo.

### Kiến trúc

```
Orchestrator (service trung tâm)
├─ saga_instance: {sagaId, status, currentStep}
├─ saga_step: {stepName, status, result}
└─ Tất cả logic flow ở đây

Order Service → publish order.created
  ↓
Orchestrator nhận → quyết định STEP 1
  ↓
Orchestrator gọi: inventory.reserve_stock
  ↓
Inventory Service execute → publish inventory.reserved
  ↓
Orchestrator nhận → quyết định STEP 2
  ↓
Orchestrator gọi: payment.create_qr
  ↓ ...
```

### Ưu điểm

- ✅ **Flow rõ ràng**: Tất cả ở một chỗ, dễ hiểu
- ✅ **Easy to debug**: Trace từ saga_instance
- ✅ **Easy to test**: Mock Orchestrator, test từng step
- ✅ **Clear state**: saga_instance biết ở step nào
- ✅ **Simple compensation**: Orchestrator biết rollback cái nào

### Nhược điểm

- ❌ **Tight coupling**: Services phải biết Orchestrator
- ❌ **Bottleneck**: Orchestrator là single point (phải xử lý tất cả flows)
- ❌ **Slow for parallel**: Phải sequential từng bước
- ❌ **Hard to scale**: Orchestrator data model phức tạp khi workflows nhiều

### Code Example

```typescript
@Injectable()
export class OrderSagaOrchestrator {
  async startSaga(event: OrderCreated) {
    const saga = await sagaRepo.save({
      sagaId: randomId(),
      orderId: event.orderId,
      status: 'RUNNING',
      currentStep: 'RESERVE_INVENTORY'
    });
    
    // STEP 1: Reserve Inventory
    try {
      await this.publishCommand('inventory.reserve_stock', {
        sagaId: saga.id,
        orderId: event.orderId,
        ...
      });
      // Chờ inventory.reserved event
      const reserved = await this.waitForEvent('inventory.reserved', saga.id);
      await sagaRepo.update(saga.id, { currentStep: 'AWAIT_PAYMENT' });
    } catch (error) {
      // Compensation
      await this.compensate(saga);
    }
    
    // STEP 2: Payment
    try {
      await this.publishCommand('payment.create_qr', { ... });
      const paid = await this.waitForEvent('payment.completed', saga.id);
      await sagaRepo.update(saga.id, { currentStep: 'CONFIRM_INVENTORY' });
    } catch (error) {
      // Compensation
      await this.publishCommand('inventory.release_stock', { ... });
      await this.compensate(saga);
    }
    
    // ... STEP 3, 4, etc.
  }
}
```

### Real-world usage

- ✅ **NextMart** (bạn đang dùng)
- ✅ **Amazon**: Order → Payment → Inventory → Shipping
- ✅ **Uber**: Ride → Payment → Matching → Pickup
- ✅ **Booking.com**: Flight → Hotel → Payment → Confirmation

---

## 3. Choreography Saga (Event-Driven)

### Định nghĩa

**Không có** Orchestrator trung tâm. Mỗi service tự **subscribe vào events**, tự quyết định khi nào xử lý, tự publish events kế tiếp.

Giống như một **nhạc ba lê tự diễn** — không có người chỉ huy, mỗi vũ công tự biết bước của mình.

### Kiến trúc

```
Order Service publish: OrderCreated
  ↓
Inventory Service subscribe → reserve stock → publish InventoryReserved
  ↓
Payment Service subscribe → create QR → publish PaymentCompleted
  ↓
Shipping Service subscribe → create label → publish ShippingArranged
  
[Tất cả tự flow, không có service nào "nhìn toàn cảnh"]
```

### Cần có: Saga State Store (để tracking)

Vì **tất cả services đều subscribe vào events của nhau** nên khó track tổng trạng thái. Cần một **Saga State Store** (database tập trung) để:

```
Mỗi service khi xử lý xong, ghi vào Saga State Store:
{
  sagaId: 'sag-001',
  serviceName: 'inventory',
  status: 'success',
  completedAt: now,
  compensationData: { ... }
}

Background job monitor:
- Query saga_participant WHERE status != 'success'
- Detect timeout: status='pending' > 15min
- Trigger compensation
```

### Ưu điểm

- ✅ **Loose coupling**: Services độc lập, không biết nhau
- ✅ **Scalable**: Mỗi service xử lý riêng, không bottleneck
- ✅ **Reactive**: Services phản ứng với events
- ✅ **Parallel-friendly**: Nhiều services có thể xử lý cùng event

### Nhược điểm

- ❌ **Hard to understand flow**: Phải follow nhiều events khác nhau
- ❌ **Hard to debug**: Không có "master view"
- ❌ **Implicit dependencies**: Payment phải biết Inventory publish cái gì
- ❌ **Distributed state**: saga_participant nằm rải rác ở database khác nhau
- ❌ **Complex compensation**: Phải coordinate rollback từ nhiều services

### Code Example

```typescript
// Inventory Service
@KafkaListener('order.created')
async onOrderCreated(event: OrderCreated) {
  const participant = await sagaStateStore.create({
    sagaId: event.sagaId,
    serviceName: 'inventory',
    status: 'pending'
  });
  
  try {
    await this.reserveStock(event.orderId);
    
    // Update state store
    await sagaStateStore.update(participant.id, {
      status: 'success',
      compensationData: { qty, productId }
    });
    
    // Publish event để payment service consume
    await this.publish('inventory.reserved', event);
  } catch (error) {
    await sagaStateStore.update(participant.id, {
      status: 'failed',
      reason: error.message
    });
    await this.publish('inventory.failed', event);
  }
}

// Payment Service
@KafkaListener('inventory.reserved')
async onInventoryReserved(event) {
  const participant = await sagaStateStore.create({
    sagaId: event.sagaId,
    serviceName: 'payment',
    status: 'pending'
  });
  
  try {
    await this.createPaymentQR(event);
    await sagaStateStore.update(participant.id, { status: 'success' });
    await this.publish('payment.completed', event);
  } catch (error) {
    await sagaStateStore.update(participant.id, { status: 'failed' });
  }
}

// Background Job: Timeout Monitor
async detectTimeouts() {
  const hanging = await sagaStateStore.find({
    status: 'pending',
    createdAt: { $lt: now - 15min }
  });
  
  for (const participant of hanging) {
    await this.publish('saga.timeout', {
      sagaId: participant.sagaId
    });
  }
}
```

### Real-world usage

- ✅ **Event Streaming Systems**: Kafka connect, CDC
- ✅ **Analytics Pipelines**: Order → multiple streams in parallel
- ⚠️ **Microservices**: Phổ biến nhưng cần Saga State Store
- ❌ **Mission-critical**: Vì complex, khó debug

---

## 4. Fan-out / Fan-in Pattern (Parallel Saga)

### Định nghĩa

Một event được xử lý bởi **nhiều services song parallel**, rồi kết quả được **tổng hợp** (fan-in) để quyết định tiếp.

```
Fan-out: 1 event → nhiều consumers (parallel)
Fan-in: Tổng hợp kết quả → quyết định tiếp

OrderCreated (1 event)
├─ Inventory (parallel)
├─ Payment (parallel)
└─ Email (parallel)

[Wait for all]

Kết quả:
├─ Inventory: success
├─ Payment: success
└─ Email: success

→ Proceed to next step
```

### Kiến trúc

```
Orchestrator Service
├─ Publish 3 commands: inventory.reserve, payment.create, email.send
├─ Wait for all 3 events to complete (with timeout)
│  ├─ inventory.reserved ✓
│  ├─ payment.completed ✓
│  └─ email.sent ✓
├─ Tổng hợp kết quả
└─ Quyết định:
   ├─ All success? → Next step
   └─ Any failed? → Compensation
```

### Ưu điểm

- ✅ **Fast**: Parallel xử lý, không chờ tuần tự
- ✅ **Still controlled**: Orchestrator tổng hợp → dễ debug
- ✅ **Clear state**: saga_instance biết tất cả participants
- ✅ **Easy compensation**: Orchestrator quyết định rollback

### Nhược điểm

- ❌ **Complex orchestration logic**: Phải handle Promise.all, timeout
- ❌ **Orchestrator bottleneck**: Phải wait tất cả parallel complete
- ❌ **Timeout handling**: Nếu 1 timeout, phải quyết định cancel hay wait

### Code Example

```typescript
async startOrderSaga(event: OrderCreated) {
  const sagaId = randomId();
  
  // Fan-out: Publish 3 commands parallel
  const results = await Promise.all([
    this.publishCommand('inventory.reserve_stock', { sagaId, ... }),
    this.publishCommand('payment.create_qr', { sagaId, ... }),
    this.publishCommand('email.send', { sagaId, ... })
  ]);
  
  // Fan-in: Wait for all to complete
  const [inventoryResult, paymentResult, emailResult] = await Promise.all([
    this.waitForEvent('inventory.reserved', sagaId, timeout=15min),
    this.waitForEvent('payment.completed', sagaId, timeout=15min),
    this.waitForEvent('email.sent', sagaId, timeout=5min)  // email non-critical
  ]);
  
  // Tổng hợp
  const allSuccess = 
    inventoryResult.status === 'success' &&
    paymentResult.status === 'success' &&
    emailResult.status === 'success';
  
  const anyFailed = 
    inventoryResult.status === 'failed' ||
    paymentResult.status === 'failed';
  
  // Quyết định
  if (allSuccess) {
    // Proceed to shipping
    await this.publishCommand('shipping.create_label', { sagaId, ... });
  } else if (anyFailed) {
    // Compensation
    await this.compensate(sagaId, {
      inventory: inventoryResult.status === 'success',
      payment: paymentResult.status === 'success'
    });
  } else if (inventoryResult.timeout || paymentResult.timeout) {
    // Critical service timeout
    await this.compensate(sagaId, { all: true });
  }
}
```

---

## 5. Real-world Examples

### E-commerce: Order Processing

```
User clicks "Place Order"
  ↓
Order Service publish: OrderCreated

[Fan-out]
├─ Inventory: reserve_stock
├─ Payment: charge_card
├─ Email: send_confirmation
└─ Analytics: track_order (non-critical)

[Fan-in]
├─ All critical success? → Shipping.create_label
└─ Any critical failed? → Compensation

Compensation:
  └─ release_stock, refund_payment, send_cancellation_email
```

### Flight Booking

```
User clicks "Book Flight"
  ↓
Flight Service publish: FlightBooked

[Fan-out]
├─ Payment: authorize_card
├─ Seat Service: assign_seat
├─ Hotel Service: reserve_hotel (if bundled)
├─ Email: send_confirmation
└─ Loyalty: add_miles

[Fan-in]
├─ Payment timeout after 10min? → Cancel & refund
├─ Seat unavailable? → Refund & cancel flight
└─ All success? → Send itinerary

Timeout: 10 minutes (critical: payment + seat + hotel)
```

### Food Delivery (Grab Food)

```
Customer place order
  ↓
Order Service: FoodOrderCreated

[Fan-out]
├─ Payment: authorize_payment (critical, 10sec timeout)
├─ Restaurant: confirm_order (critical, 30sec timeout)
├─ Driver: find_available_driver (critical, 5min timeout)
├─ Email/SMS: send_confirmation (non-critical)
└─ Analytics: track_order (non-critical)

[Fan-in]
├─ Payment + Restaurant OK, Driver timeout?
│  → Keep waiting (max 5min)
│  → Still no driver? → Refund + Cancel
│
├─ Payment OK, Restaurant fails?
│  → Refund + Send "unavailable" message
│
└─ All success?
   → Notify driver to pickup
   → Notify customer "driver on the way"
```

### Ride-hailing (Uber)

```
Passenger request ride
  ↓
Ride Service: RideRequested

[Fan-out - SHORT TIMEOUT: 30 seconds]
├─ Payment: authorize_payment
├─ Driver Matching: find_nearby_drivers
└─ Pricing: calculate_fare

[Fan-in]
├─ No driver found in 30sec?
│  → Show "No drivers available"
│  → Release payment authorization
│
├─ Driver found, payment authorized?
│  → Driver accepted → send driver details
│
└─ Payment failed?
   → Cancel request, show error
```

### Payment Gateway (Stripe)

```
Merchant initiate payment
  ↓
Payment Service: PaymentInitiated

[Fan-out - HIGHLY PARALLEL]
├─ Fraud Detection: check_fraud_score (critical, 5sec)
├─ 3D Secure: verify_3ds (critical, 10sec)
├─ Card Processor: charge_card (critical, 30sec)
├─ Webhook: notify_merchant (non-critical)
├─ Analytics: log_transaction (non-critical)
└─ Audit: compliance_log (non-critical)

[Fan-in]
├─ Fraud score HIGH? → Decline
├─ 3DS failed? → Decline
├─ Card declined? → Decline + notify merchant
└─ All success? → Charge card + Authorize
```

---

## 6. Trade-offs & Decision Matrix

### Orchestrator vs Choreography

| Yếu tố | Orchestrator | Choreography |
|--------|---|---|
| **Flow hiểu** | ✅ Dễ (1 chỗ) | ❌ Khó (nhiều events) |
| **Debug** | ✅ Dễ (saga_instance) | ❌ Khó (query 3 databases) |
| **Add new step** | ⚠️ Sửa Orchestrator | ❌ Sửa nhiều services |
| **Loose coupling** | ❌ Tight | ✅ Loose |
| **Scaling** | ⚠️ Orchestrator bottleneck | ✅ Horizontal |
| **Parallel support** | ✅ Via fan-out/fan-in | ✅ Native |
| **State management** | ✅ Centralized | ❌ Distributed |
| **Learning curve** | ✅ Thấp | ❌ Cao |

### Khi nào dùng cái nào?

| Workflow | Recommend |
|----------|-----------|
| **Sequential required** (A→B→C) | ✅ Orchestrator |
| **Sequential + Parallel** (A→{B,C,D}→E) | ✅ Orchestrator (fan-out/fan-in) |
| **Many parallel, independent** | ✅ Choreography + SSS |
| **Complex compensation** | ✅ Orchestrator |
| **Microservices just starting** | ✅ Orchestrator |
| **Mature, many services** | ⚠️ Hybrid (Orchestrator + Choreography) |

---

## 7. Key Insights

### Truth #1: Luôn cần "tổng hợp"

Dù Choreography hay Orchestrator, **luôn luôn cần một component tập trung để tổng hợp**:

- **Orchestrator Saga**: Orchestrator Service tổng hợp (active control)
- **Choreography Saga**: Saga State Store tổng hợp (passive tracking)

**Không có cách escape!**

### Truth #2: Orchestrator không phải "bad"

Nhiều người nói Choreography là "event-driven best practice", nhưng thực tế:
- ✅ Orchestrator phù hợp với **sequential workflows**
- ✅ Dễ debug, dễ test, dễ maintain
- ✅ Được dùng ở **Amazon, Uber, Netflix** (phần critical paths)

### Truth #3: Fan-out/Fan-in là hybrid

Orchestrator + Fan-out/Fan-in = kết hợp tốt nhất:
- ✅ Rõ ràng (Orchestrator)
- ✅ Nhanh (parallel)
- ✅ Dễ debug (centralized state)
- ✅ Dễ compensation (orchestrator quyết định)

---

## 8. Nextmart Implementation

### Hiện tại (Phase 2)

✅ **Orchestrator Saga (Sequential)**

```
Order → Inventory → Payment → Shipping → Delivery
(pure sequential, orchestrator kiểm soát từng step)
```

### Phase 3 (Optional)

Nếu cần parallel:

```
Order → {Inventory + Payment + Email} → Shipping
(fan-out: 3 parallel, fan-in: orchestrator chờ tất cả)
```

Hoặc nếu cần loose coupling:

```
Order → {Inventory, Payment, Email} (choreography)
+ Saga State Store tracking (background jobs)
```

---

## Summary

| Concept | Định nghĩa |
|---------|-----------|
| **Saga** | Distributed transaction pattern cho microservices |
| **Orchestrator Saga** | Service trung tâm kiểm soát, dễ debug |
| **Choreography Saga** | Services tự quyết định, loose coupling, cần SSS |
| **Fan-out/Fan-in** | Parallel + orchestration, hybrid approach |
| **Saga State Store** | Database tập trung track saga participants |
| **Compensation** | Undo các bước thành công khi có error |

**Best practice cho NextMart: Orchestrator Saga + Fan-out/Fan-in (khi cần parallel)** ✅
