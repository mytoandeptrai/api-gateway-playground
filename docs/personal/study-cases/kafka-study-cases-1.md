# Kafka Study Cases #1

> Tổng hợp các khái niệm và case study Kafka từ quá trình thiết kế hệ thống NextMart.

---

## 1. Partition là gì? Replication Factor là gì?

### Partition

Kafka chia mỗi topic thành nhiều **partition** — giống như chia 1 con đường thành nhiều **làn đường song song**.

```
Topic: order.created  (3 partitions)
├── Partition 0: [msg-A, msg-D, msg-G, ...]
├── Partition 1: [msg-B, msg-E, msg-H, ...]
└── Partition 2: [msg-C, msg-F, msg-I, ...]
```

**Tính chất quan trọng:**

- Message trong **cùng 1 partition** được xử lý **tuần tự** (first in, first out)
- Message ở **2 partition khác nhau** được xử lý **song song**, không đảm bảo thứ tự với nhau
- Consumer group có tối đa N consumer đọc song song = N partitions (1 consumer/partition)

**Ví dụ lợi ích:** Topic có 3 partitions → 3 consumer instances đọc song song → throughput gấp 3 lần so với 1 partition.

### Replication Factor

Số bản **sao lưu** của mỗi partition trên các Kafka broker khác nhau.

```
Partition 0 với replication factor = 3:
  Broker 1: [P0-Leader]   ← consumer đọc/ghi vào đây
  Broker 2: [P0-Replica]  ← bản sao dự phòng
  Broker 3: [P0-Replica]  ← bản sao dự phòng
```

| Môi trường | Replication Factor | Ý nghĩa                                              |
| ---------- | ------------------ | ---------------------------------------------------- |
| Local dev  | 1                  | Không có bản sao. Broker chết → mất data. OK để test |
| Production | 3                  | Chịu được 2 broker chết vẫn không mất data           |

---

## 2. Partition Key — Nguyên tắc chọn

### Partition key là gì?

Khi publish message lên Kafka, bạn chỉ định một **partition key**. Kafka dùng công thức:

```
partition_số = hash(key) % tổng_số_partition
```

Cùng key → cùng partition → **xử lý tuần tự**.  
Khác key → có thể khác partition → **xử lý song song**.

### Câu hỏi để chọn đúng partition key

> **"Nếu 2 events này đến sai thứ tự, nghiệp vụ có bị sai không?"**

- **Có** → 2 events phải cùng partition → dùng chung 1 partition key
- **Không** → xử lý song song được, không cần cùng partition

### Ví dụ minh họa

**Trường hợp 1: Order Saga — dùng `orderId`**

```
Event đúng thứ tự:
  order.created → inventory.reserved → payment.completed → shipped

Event sai thứ tự (payment.completed đến trước order.created):
  payment.completed → ???
  Orchestrator tra DB: "Saga này chưa tồn tại, tao làm gì bây giờ?" → crash hoặc bỏ event
```

→ Phải đảm bảo thứ tự cho tất cả events của **cùng 1 order** → dùng `orderId` làm key.

Nhưng Order A và Order B hoàn toàn độc lập — dù B xử lý trước A cũng không ảnh hưởng gì → chúng ở partition khác nhau, chạy song song là đúng.

---

**Trường hợp 2: Số dư tài khoản ngân hàng — dùng `accountId`**

```
Tài khoản X có 500k:
  Event 1: Nạp 200k  → đúng thứ tự: 500 → 700k
  Event 2: Rút 300k  → đúng thứ tự: 700 → 400k

Nếu sai thứ tự (Rút trước, Nạp sau):
  Event 2 xử lý: Rút 300k từ 500k → còn 200k
  Event 3 (check): Số dư 200k < cần 300k → từ chối giao dịch ← SAI
  Event 1 xử lý: Nạp 200k → 400k ← quá trễ, giao dịch bị từ chối oan
```

→ Tất cả events của **cùng 1 tài khoản** phải tuần tự → dùng `accountId` làm key.

---

**Trường hợp 3: Stock sản phẩm — dùng `productId`**

```
Product-X còn 1 cái:
  Event 1: reserve 1 (order-A) → stock = 0
  Event 2: reserve 1 (order-B) → check: stock = 0, INSUFFICIENT → từ chối ✅

Nếu xử lý song song (sai thứ tự / race condition):
  Thread 1 đọc: stock = 1 → đủ hàng
  Thread 2 đọc: stock = 1 → đủ hàng (đọc trước khi thread 1 ghi)
  Thread 1 ghi: stock = 0, reserved++
  Thread 2 ghi: stock = 0, reserved++ ← đọc giá trị cũ, ghi đè → OVERSELL 💥
```

→ Tất cả thay đổi stock của **cùng 1 sản phẩm** phải tuần tự → dùng `productId` làm key.

---

### Bảng tổng hợp các bài toán thực tế

| Bài toán               | Partition Key    | Lý do                                             |
| ---------------------- | ---------------- | ------------------------------------------------- |
| Order Saga events      | `orderId`        | Saga steps của 1 order phải đúng thứ tự           |
| Tài khoản ngân hàng    | `accountId`      | Debit/credit cùng tài khoản phải tuần tự          |
| Inventory stock        | `productId`      | Stock changes cùng sản phẩm không được race       |
| Chat messages          | `conversationId` | Tin nhắn trong cùng conversation phải theo thứ tự |
| User notification feed | `userId`         | Thông báo hiển thị đúng thứ tự thời gian          |
| Audit log              | `entityId`       | Lịch sử thay đổi của 1 entity phải theo thứ tự    |

---

## 3. Hot Partition

### Định nghĩa

**Hot partition** xảy ra khi 1 partition nhận **quá nhiều message** so với các partition khác, do partition key phân phối không đều.

### Ví dụ

Nếu dùng `userId` làm partition key cho order events:

```
hash("user-power-shop") % 3 = 1
→ User này đặt 10,000 orders/ngày → tất cả dồn vào Partition 1

Partition 0: ██░░░░░░░░  200 msg/s   (consumer nhàn rỗi)
Partition 1: ██████████  9,000 msg/s  (consumer quá tải 🔥)
Partition 2: ███░░░░░░░  800 msg/s   (bình thường)
```

Consumer của Partition 1 bị nghẽn → latency tăng → toàn bộ orders của user đó bị delay.

### UUID random phân phối đều hơn

```
Với orderId là UUID (random):
hash("550e8400-e29b...") % 3 = 0  → Partition 0
hash("6ba7b810-9dad...") % 3 = 2  → Partition 2
hash("6ba7b811-9dad...") % 3 = 1  → Partition 1
...

Partition 0: ████████░░  ~3,300 msg/s
Partition 1: ███████░░░  ~3,200 msg/s
Partition 2: ████████░░  ~3,500 msg/s  ← phân phối đều
```

### Kết luận

Dùng UUID hoặc ID có tính ngẫu nhiên cao làm partition key sẽ phân phối đều hơn.  
`userId` (số lượng nhỏ, phân phối không đều) dễ gây hot partition hơn `orderId` (UUID).

---

## 4. Event vs Command trong Kafka

Đây là 2 loại message có **ý định khác nhau**, dù đều đi qua Kafka.

### Event — "Điều gì đó đã xảy ra"

- Thì **quá khứ**: "order đã được tạo", "payment đã hoàn thành"
- Publisher **không quan tâm** ai xử lý, ai cần thì subscribe
- Có thể có **0 hoặc nhiều** consumer

```
Order Service → Kafka topic "order.created":
  "Tao vừa tạo xong order #123, ai cần thì lấy mà dùng"

Subscribers:
  - Orchestrator: bắt đầu saga
  - Notification: gửi email xác nhận
  - Analytics: ghi log
```

### Command — "Hãy làm điều này"

- Thì **mệnh lệnh**: "hãy reserve stock", "hãy tạo shipping label"
- Publisher **biết rõ** service nào sẽ xử lý, gửi thẳng đến đó
- Thường chỉ có **1 consumer** duy nhất

```
Orchestrator → Kafka topic "inventory.reserve_stock":
  "Mày là Inventory Service, hãy giữ 2 cái product #456 cho order #123 ngay"

Consumer duy nhất:
  - Inventory Service: thực hiện lệnh, trả về event kết quả
```

### So sánh

|                | Event                                | Command                                            |
| -------------- | ------------------------------------ | -------------------------------------------------- |
| Thì động từ    | Past tense — "đã xảy ra"             | Imperative — "hãy làm"                             |
| Người nhận     | Không xác định, ai cần thì lấy       | 1 service cụ thể                                   |
| Ví dụ NextMart | `payment.completed`, `order.created` | `inventory.reserve_stock`, `shipping.create_label` |
| Pattern dùng   | Choreography, fan-out                | Orchestrator Saga                                  |

### Trong Orchestrator Saga của NextMart

Orchestrator điều phối theo vòng lặp:

```
Orchestrator phát ra Command  →  Service thực hiện  →  Service phát ra Event
     │                                                         │
     └─────────────────────── lắng nghe ───────────────────────┘

Ví dụ:
Orchestrator → command: "inventory.reserve_stock" {sagaId: A, productId: X, qty: 1}
Inventory    → event:   "inventory.stock_reserved" {sagaId: A}
             hoặc
Inventory    → event:   "inventory.stock_insufficient" {sagaId: A}
```

---

## 5. Race Condition Inventory — Case thực tế trong NextMart

### Tình huống

User A và User B cùng mua sản phẩm X (stock = 1) tại đúng cùng thời điểm.

### Tại sao Kafka partition key `orderId` không giúp được?

```
Saga A: inventory.reserve_stock {orderId: "order-1", productId: "X"}
Saga B: inventory.reserve_stock {orderId: "order-2", productId: "X"}

hash("order-1") % 3 = 0  → Partition 0
hash("order-2") % 3 = 2  → Partition 2
```

Hai commands đi vào 2 partition khác nhau → **Inventory Service xử lý song song**:

```
Thread 1 (order-1): READ available = 1  → đủ hàng ✅
Thread 2 (order-2): READ available = 1  → đủ hàng ✅  ← đọc trước khi Thread 1 ghi
Thread 1:           WRITE available = 0, reserved = 1
Thread 2:           WRITE available = 0, reserved = 1  ← OVERSELL 💥
```

### Cách 1: Đổi partition key sang `productId` cho inventory topics

```
inventory.reserve_stock {productId: "X"} → partition key = "X"
```

Cả 2 commands đều vào **cùng partition** → xử lý **tuần tự**:

```
Thread 1 (order-1): READ available = 1 → WRITE available = 0 ✅
Thread 1 (order-2): READ available = 0 → INSUFFICIENT → từ chối ✅
```

Không cần lock, Kafka đảm bảo thứ tự.

### Cách 2: Redlock (cách NextMart đang dùng)

```typescript
const lock = await redlock.acquire(`inventory:lock:product-X`, 5000);
try {
  const item = await inventoryRepo.findOne({ productId: "X" });
  if (item.available < quantity) throw new InsufficientStockException();
  item.reserved += quantity;
  item.available -= quantity;
  await inventoryRepo.save(item);
} finally {
  await lock.release();
}
```

Dù 2 threads chạy song song, chỉ 1 thread giữ được lock tại 1 thời điểm.

### So sánh 2 cách

|                    | Partition key `productId` | Redlock                            |
| ------------------ | ------------------------- | ---------------------------------- |
| Cơ chế             | Kafka đảm bảo sequential  | Redis đảm bảo mutual exclusion     |
| Bảo vệ được khi    | Chỉ qua Kafka             | Mọi luồng (Kafka, HTTP, cron, ...) |
| Lock timeout       | Không cần                 | Cần config TTL hợp lý              |
| Production thực tế | Thường kết hợp cả 2       | Lớp bảo vệ cuối cùng               |

> **NextMart dùng Redlock** vì bảo vệ toàn diện hơn và là pattern quan trọng cần học.  
> Production lớn thường dùng cả hai: partition key để giảm contention, Redlock/DB transaction làm safety net.

---

## 6. Nhiều Saga chạy song song — KHÔNG phải nhiều Orchestrator

### Nhầm lẫn thường gặp

> "Nếu 2 sagas chạy song song, có phải cần 2 Orchestrator services không?"

**Không.** Chỉ cần **1 Orchestrator Service** duy nhất.

### Orchestrator là stateless

Orchestrator không "giữ" saga trong memory. Toàn bộ trạng thái được lưu trong DB:

```
DB bảng SagaInstance:
  id: "saga-A", orderId: "order-1", currentStep: "AWAIT_PAYMENT", status: RUNNING
  id: "saga-B", orderId: "order-2", currentStep: "RESERVE_INVENTORY", status: RUNNING
  id: "saga-C", orderId: "order-3", currentStep: "CREATE_SHIPPING", status: RUNNING
```

### Cách Orchestrator xử lý nhiều saga

```
Orchestrator nhận event: inventory.stock_reserved {sagaId: "B"}
→ SELECT * FROM saga_instance WHERE id = "B"
→ UPDATE step RESERVE_INVENTORY = COMPLETED
→ Tạo step AWAIT_PAYMENT = IN_PROGRESS
→ Publish command: payment.create_qr {sagaId: "B"}

(10ms sau)

Orchestrator nhận event: payment.completed {sagaId: "A"}
→ SELECT * FROM saga_instance WHERE id = "A"
→ UPDATE step AWAIT_PAYMENT = COMPLETED
→ Tạo step CONFIRM_INVENTORY = IN_PROGRESS
→ Publish command: inventory.confirm_stock {sagaId: "A"}
```

Orchestrator chỉ đơn giản là: **nhận event → tra DB xem saga đó đang ở bước nào → làm tiếp bước tiếp theo**.

### Tại sao `sagaId` phải có mặt trong mọi event

```
Event KHÔNG có sagaId:
  inventory.stock_reserved { orderId: "order-1" }
  → Orchestrator: "order-1 có 2 saga đang chạy (1 order + 1 refund), tao update cái nào?" 🤔

Event CÓ sagaId:
  inventory.stock_reserved { sagaId: "saga-A", orderId: "order-1" }
  → Orchestrator: "SELECT saga WHERE id = 'saga-A', update bước RESERVE_INVENTORY" ✅
```

### Hình dung trực quan

```
Orchestrator = 1 bồi bàn quản lý nhiều bàn cùng lúc

Bàn 1 (Saga A): đang chờ thanh toán    → bồi bàn ghi: "bàn 1: step 2"
Bàn 2 (Saga B): đang chuẩn bị hàng    → bồi bàn ghi: "bàn 2: step 3"
Bàn 3 (Saga C): đang giao hàng        → bồi bàn ghi: "bàn 3: step 4"

Bồi bàn KHÔNG clone ra 3 người.
Anh ta chỉ có 1 bộ não + 1 cuốn sổ ghi trạng thái từng bàn (= DB).
Mỗi khi có khách gọi (= Kafka event đến), anh tra sổ rồi phục vụ đúng bàn.
```

---

## Tóm tắt nhanh

| Khái niệm                | Một câu ghi nhớ                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Partition                | Làn đường song song. Cùng làn = tuần tự. Khác làn = song song.                                                            |
| Partition key            | Nếu 2 events hoán đổi thứ tự mà nghiệp vụ sai → chúng phải cùng partition → dùng chung key.                               |
| Replication factor       | Số bản sao backup. Dev dùng 1, production dùng 3.                                                                         |
| Hot partition            | 1 partition nhận quá nhiều traffic vì key phân phối không đều. UUID tốt hơn userId.                                       |
| Event vs Command         | Event = "đã xảy ra" (quá khứ, ai cần thì dùng). Command = "hãy làm" (mệnh lệnh, gửi đích danh).                           |
| Race condition inventory | 2 orders cùng reserve 1 sản phẩm → Kafka không giúp vì chúng khác partition. Dùng Redlock hoặc partition key `productId`. |
| Song song nhiều Saga     | 1 Orchestrator, N SagaInstance trong DB. Orchestrator stateless, tra DB theo sagaId mỗi khi xử lý event.                  |
