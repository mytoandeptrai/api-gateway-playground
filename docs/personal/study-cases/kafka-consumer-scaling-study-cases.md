# Kafka Consumer Scaling Study Cases

> Tổng hợp các khái niệm và case study về dynamic consumer scaling, groupId, rebalancing — từ quá trình implement inventory-service trong NextMart.

---

## 1. Consumer Group là gì? GroupId dùng để làm gì?

### Định nghĩa

**Consumer Group** là tập hợp các consumer cùng đọc chung 1 topic, chia nhau các partition để xử lý song song.

```
Topic: inventory.reserve_stock (3 partitions)

Consumer Group: "inventory-group-inventory.reserve_stock"
  ├── Consumer instance 0 → Partition 0
  ├── Consumer instance 1 → Partition 1
  └── Consumer instance 2 → Partition 2
```

**GroupId** là tên định danh của group. Kafka dùng groupId để:
- Theo dõi **offset** đã đọc đến đâu (mỗi group có offset riêng)
- Quản lý **partition assignment** (partition nào cho consumer nào)
- Tách biệt các luồng xử lý độc lập nhau

### Ví dụ thực tế trong NextMart

```
Topic: order.created

Group A: "notification-group"  → đọc để gửi email
Group B: "orchestrator-group"  → đọc để bắt đầu saga
Group C: "analytics-group"     → đọc để ghi log thống kê

→ 3 groups đọc cùng 1 topic, mỗi group nhận đủ toàn bộ message
→ message được delivered tới TẤT CẢ groups (fan-out)
```

---

## 2. Khi nào dùng CÙNG groupId? Khi nào dùng KHÁC groupId?

### Cùng groupId → Scale throughput của 1 topic

Nhiều consumer cùng groupId sẽ **chia nhau partition** của 1 topic.

```
Topic: inventory.reserve_stock (3 partitions)
GroupId: "inventory-group-inventory.reserve_stock"

Instance 0: chỉ đọc Partition 0
Instance 1: chỉ đọc Partition 1
Instance 2: chỉ đọc Partition 2
```

**Khi dùng:** Khi 1 topic có nhiều message và 1 consumer không xử lý kịp → scale ngang bằng cách thêm consumer cùng group.

**Quy tắc:** `số consumer active = min(số partition, số consumer)`

```
3 partitions + 5 consumers (cùng group):
  → 3 consumer active (mỗi người 1 partition)
  → 2 consumer nhàn rỗi, chờ failover

3 partitions + 2 consumers (cùng group):
  → Consumer 0: Partition 0 + Partition 1
  → Consumer 1: Partition 2
```

### Khác groupId → Mỗi topic được xử lý độc lập

Mỗi topic nên có groupId riêng khi các topic phục vụ **mục đích khác nhau**.

```
Topic A: inventory.reserve_stock  → groupId: "inventory-group-inventory.reserve_stock"
Topic B: inventory.confirm_stock  → groupId: "inventory-group-inventory.confirm_stock"
Topic C: inventory.release_stock  → groupId: "inventory-group-inventory.release_stock"

→ 3 groups hoàn toàn độc lập, không ảnh hưởng nhau
```

**Khi dùng:** Khi xử lý các topic khác nhau, nghiệp vụ khác nhau.

### Bảng so sánh

| Tình huống                              | GroupId   | Kết quả                                              |
| --------------------------------------- | --------- | ---------------------------------------------------- |
| Scale throughput của 1 topic            | Cùng nhau | N consumer chia nhau partition, xử lý song song      |
| Nhiều topic phục vụ nghiệp vụ khác nhau | Khác nhau | Mỗi group độc lập, offset riêng, không rebalance chéo |
| Fan-out: nhiều service đọc 1 topic      | Khác nhau | Mỗi service nhận đủ toàn bộ message                  |

---

## 3. Rebalancing là gì? Khi nào xảy ra?

### Định nghĩa

**Rebalancing** là quá trình Kafka **tái phân bổ partition** cho các consumer trong cùng 1 group. Trong suốt thời gian rebalance, **toàn bộ consumer trong group dừng xử lý message** ("stop the world").

### Các sự kiện trigger rebalance

```
1. Consumer mới join group (startup)
2. Consumer rời group (shutdown, crash)
3. Consumer heartbeat timeout (bị coi là chết)
4. Partition của topic thay đổi (thêm partition)
5. Consumer thay đổi danh sách topic subscription
```

### Rebalance trông như thế nào

```
Trạng thái ban đầu (stable):
  Consumer 0 → Partition 0  ✅ đang xử lý
  Consumer 1 → Partition 1  ✅ đang xử lý
  Consumer 2 → Partition 2  ✅ đang xử lý

Consumer mới join → REBALANCE bắt đầu:
  Consumer 0: DỪNG xử lý, revoke Partition 0
  Consumer 1: DỪNG xử lý, revoke Partition 1
  Consumer 2: DỪNG xử lý, revoke Partition 2
  Consumer 3: chờ assignment

Kafka Group Coordinator phân bổ lại:
  Consumer 0 → Partition 0
  Consumer 1 → Partition 1
  Consumer 2 → Partition 2
  Consumer 3 → (nhàn rỗi — không có partition để gán)

REBALANCE kết thúc → tất cả resume xử lý
```

### Kiểm tra rebalance trong Kafka UI

Vào **Kafka UI → Consumer Groups → chọn group** → xem cột **State**:

| State         | Ý nghĩa                                            |
| ------------- | -------------------------------------------------- |
| `STABLE`      | Group ổn định, tất cả consumer đang xử lý bình thường |
| `REBALANCING` | Đang tái phân bổ partition, processing bị tạm dừng   |
| `EMPTY`       | Group không có consumer nào                         |

---

## 4. Bug thực tế: Cùng groupId + Khác topic → Rebalance liên tục

### Mô tả lỗi

Inventory service có 3 consumer cho 3 topic khác nhau, nhưng ban đầu dùng **cùng 1 groupId**:

```typescript
// ❌ SAI — tất cả dùng chung group
const groupId = 'inventory-group';

Consumer 0: subscribe('inventory.reserve_stock'),  groupId: 'inventory-group'
Consumer 1: subscribe('inventory.confirm_stock'),  groupId: 'inventory-group'
Consumer 2: subscribe('inventory.release_stock'),  groupId: 'inventory-group'
```

### Tại sao lỗi?

Kafka yêu cầu mọi consumer trong cùng 1 group phải subscribe **cùng một tập hợp topic**.

```
Kafka Group Coordinator nhìn vào "inventory-group":
  Member 0 muốn: [inventory.reserve_stock]
  Member 1 muốn: [inventory.confirm_stock]
  Member 2 muốn: [inventory.release_stock]

→ "Mày 3 người cùng group nhưng muốn topic khác nhau???"
→ Kafka không thể tạo assignment nhất quán
→ REBALANCE → assignment sai → REBALANCE lại → lặp vô tận
```

### Triệu chứng quan sát được

- Consumer group State luôn là `REBALANCING` trong Kafka UI
- Log xuất hiện liên tục: `[KAFKA] Consumer created for topic: ...`
- Message không bao giờ được xử lý dù đã publish lên topic
- Service khởi động bình thường nhưng không nhận được event nào

### Fix: Mỗi topic có groupId riêng

```typescript
// ✅ ĐÚNG — mỗi handler tự derive groupId từ tên topic
getGroupId(): string {
  return `inventory-group-${this.getTopic()}`;
}

// Kết quả:
Consumer 0: subscribe('inventory.reserve_stock'), groupId: 'inventory-group-inventory.reserve_stock'
Consumer 1: subscribe('inventory.confirm_stock'),  groupId: 'inventory-group-inventory.confirm_stock'
Consumer 2: subscribe('inventory.release_stock'),  groupId: 'inventory-group-inventory.release_stock'

→ 3 groups độc lập, mỗi group chỉ có 1 consumer, subscription nhất quán
→ STABLE ngay sau startup
```

---

## 5. Dynamic Consumer Scaling Pattern — BaseTopicHandler\<T\>

### Vấn đề cần giải quyết

Trước khi refactor, code cứng (hardcode) số consumer và topic trong `onModuleInit`:

```typescript
// ❌ Hardcode — khó scale, không tách được config
await this.kafkaConsumer.subscribe({ topics: ['inventory.reserve_stock'], groupId: 'inventory-group' });
await this.kafkaConsumer.subscribe({ topics: ['inventory.confirm_stock'], groupId: 'inventory-group' });
await this.kafkaConsumer.subscribe({ topics: ['inventory.release_stock'], groupId: 'inventory-group' });
```

### Giải pháp: BaseTopicHandler\<T\> abstract class

Mỗi topic có 1 handler class riêng. Logic bootstrap consumer được tách vào `InventoryConsumerService`, đọc config từ env.

```typescript
// base-topic.handler.ts
export abstract class BaseTopicHandler<T> {
  abstract getTopic(): string;
  abstract handle(event: T): Promise<void>;

  getGroupId(): string {
    return `inventory-group-${this.getTopic()}`;
  }

  getConsumerCount(): number {
    return this.configService.get<number>(`number_of_consumer_${this.getTopic()}`, 1);
  }

  getPartitionCount(): number {
    return this.configService.get<number>(`partitions_${this.getTopic()}`, 1);
  }

  asMessageHandler(): MessageHandler {
    return (message) => this.processMessage(message);
  }

  async processMessage(message: KafkaMessagePayload): Promise<void> {
    if (!message.value) return;
    const event = JSON.parse(message.value) as T;  // cast 1 lần duy nhất
    await this.handle(event);
  }
}
```

```typescript
// reserve-stock.handler.ts
@Injectable()
export class ReserveStockHandler extends BaseTopicHandler<KafkaEnvelope> {
  getTopic() { return 'inventory.reserve_stock'; }
  async handle(event: KafkaEnvelope): Promise<void> {
    await this.inventoryService.reserveStock(event);
  }
}
```

### Tại sao cần `asMessageHandler()`?

Khi truyền method của class sang nơi khác như callback, JavaScript mất `this` binding:

```typescript
// ❌ this bị mất — handler.handle sẽ throw lỗi
await kafkaConsumer.createConsumers(options, count, handler.handle);

// ✅ arrow function giữ this binding
await kafkaConsumer.createConsumers(options, count, handler.asMessageHandler());
// Tương đương:
await kafkaConsumer.createConsumers(options, count, (msg) => handler.processMessage(msg));
```

`asMessageHandler()` tạo 1 arrow function bao ngoài method → `this` luôn trỏ đúng về instance của handler.

### Tại sao dùng `abstract`?

`abstract` ép subclass phải implement method — nếu quên sẽ bị TypeScript báo lỗi compile-time thay vì runtime.

```typescript
abstract getTopic(): string;   // subclass BẮT BUỘC phải implement
abstract handle(event: T): Promise<void>;  // subclass BẮT BUỘC phải implement
```

### Bootstrap trong InventoryConsumerService

```typescript
async onModuleInit() {
  for (const handler of this.handlers) {
    const topic = handler.getTopic();
    const count = handler.getConsumerCount();  // đọc từ env: number_of_consumer_<topic>

    if (count <= 0) {
      this.logger.warn(`[KAFKA] Consumer disabled for ${topic}`);
      continue;
    }

    const partitionCount = handler.getPartitionCount();  // đọc từ env: partitions_<topic>
    await this.kafkaAdmin.ensureTopicPartitions(topic, partitionCount);

    await this.kafkaConsumer.createConsumers(
      { topics: [topic], groupId: handler.getGroupId(), fromBeginning: false },
      count,
      handler.asMessageHandler(),
    );
  }
}
```

### Config trong .env

```env
# Số partition cho mỗi topic (tối thiểu bằng số consumer muốn chạy)
partitions_inventory.reserve_stock=3
partitions_inventory.confirm_stock=3
partitions_inventory.release_stock=3

# Số consumer instance cho mỗi topic (0 = disable)
number_of_consumer_inventory.reserve_stock=3
number_of_consumer_inventory.confirm_stock=1
number_of_consumer_inventory.release_stock=1
```

---

## 6. Partition và Consumer — Quy tắc vàng

### min(partitions, consumers)

```
Số consumer active = min(số partition, số consumer trong group)
```

```
Case 1: 3 partitions, 3 consumers (cùng group)
  → 3 active (mỗi consumer 1 partition) — throughput tối đa ✅

Case 2: 3 partitions, 5 consumers (cùng group)
  → 3 active, 2 idle (chờ failover) — lãng phí 2 consumer ⚠️

Case 3: 1 partition, 3 consumers (cùng group)
  → 1 active, 2 idle — scale consumer không có tác dụng ❌
```

**Kết luận:** Muốn scale lên N consumer → phải có ít nhất N partition.

### Partition chỉ tăng, không giảm

Kafka không cho phép giảm số partition của topic đã tồn tại. Để giảm partition:

```
1. Delete topic (mất toàn bộ message chưa xử lý)
2. Recreate với số partition mới
```

Vì vậy, `ensureTopicPartitions()` chỉ tạo thêm, không bao giờ xóa:

```typescript
async ensureTopicPartitions(topic: string, numPartitions: number) {
  const currentCount = await this.getPartitionCount(topic);
  if (currentCount >= numPartitions) return;  // đã đủ, bỏ qua
  await this.admin.createPartitions({ topicPartitions: [{ topic, count: numPartitions }] });
}
```

---

## 7. Consumer Lag là gì? Tại sao lại bị lag?

### Định nghĩa

**Consumer Lag** = số message đã được publish lên topic nhưng **chưa được consumer commit offset**.

```
Topic partition 0:
  Offset 0: msg-A  ✅ committed
  Offset 1: msg-B  ✅ committed
  Offset 2: msg-C  ⚠️ processed nhưng chưa committed (lag = 1)
  Offset 3: msg-D  ❌ chưa được đọc

Latest offset: 3
Committed offset: 1
Lag = 3 - 1 = 2
```

### Tại sao lag xuất hiện trong NextMart?

Trước khi fix lỗi NaN, `reserveStock` throw exception:

```typescript
// inventory.service.ts — trước khi fix
await this.inventoryRepo.save({
  quantity: event.payload.quantity as number,  // type cast không convert NaN → throw DB error
});
```

Khi exception xảy ra trong KafkaJS `eachMessage`:
1. Message được "xử lý" (eachMessage callback chạy xong)
2. Nhưng offset **không được commit** vì handler throw error
3. Consumer restart → đọc lại từ offset cuối đã commit
4. Lag tích lũy = số message đã xử lý nhưng failed commit

### Fix lag sau khi sửa code

Sau khi fix lỗi NaN, consumer vẫn replay các message cũ vì offset chưa commit. Cần reset offset về latest:

```
Kafka UI → Consumer Groups → group name → Reset Offset → Latest
```

Idempotency (`ProcessedEvent` table) bảo vệ khỏi xử lý trùng khi replay.

---

## 8. Generic `BaseTopicHandler<T>` — Tại sao không dùng `any`?

### Vấn đề với `any`

```typescript
// ❌ any — mất type safety hoàn toàn
async handle(event: any): Promise<void> {
  event.payload.productId;  // không có autocomplete, lỗi runtime mà không biết
}
```

### Generic giải quyết thế nào?

```typescript
// ✅ Generic — type safe từ handler đến service
export abstract class BaseTopicHandler<T> {
  abstract handle(event: T): Promise<void>;

  async processMessage(message: KafkaMessagePayload): Promise<void> {
    const event = JSON.parse(message.value) as T;  // cast 1 lần duy nhất tại boundary
    await this.handle(event);
  }
}

// Concrete handler biết chính xác type của event
export class ReserveStockHandler extends BaseTopicHandler<KafkaEnvelope> {
  async handle(event: KafkaEnvelope): Promise<void> {
    // TypeScript biết event.payload, event.sagaId, etc.
    const { productId, quantity } = event.payload;
  }
}
```

**Nguyên tắc:** Cast `as T` chỉ 1 lần tại boundary (nơi nhận raw string từ Kafka). Từ đó trở vào sâu hơn, code hoàn toàn type safe.

---

## 9. Bug thực tế: NaN trong DB

### Lỗi

```
ERROR: invalid input syntax for type integer: "NaN"
```

### Nguyên nhân

TypeScript type cast là **compile-time only**, không convert giá trị runtime:

```typescript
const quantity = event.payload.quantity as number;
// Nếu event.payload.quantity = undefined (trường này không được gửi)
// as number không làm gì cả → quantity vẫn là undefined
// Khi save vào DB: undefined → TypeORM convert → "NaN" → PostgreSQL từ chối
```

### Fix

```typescript
const quantity = Number(event.payload.quantity);
if (!productId || isNaN(quantity)) {
  this.logger.error(`[reserveStock] Invalid payload: productId=${productId} quantity=${quantity}`);
  return;  // skip message, đừng throw (để commit offset)
}
```

`Number(undefined)` = `NaN`, `isNaN(NaN)` = `true` → guard hoạt động đúng.

---

## Tóm tắt nhanh

| Khái niệm | Một câu ghi nhớ |
| --- | --- |
| Consumer Group | Tập consumer cùng đọc 1 topic, chia nhau partition, dùng chung offset tracking |
| Cùng groupId | Scale throughput: N consumer chia N partition của cùng 1 topic |
| Khác groupId | Mỗi topic độc lập, không rebalance chéo nhau |
| Rebalancing | Kafka tái phân bổ partition — toàn group dừng xử lý trong lúc này |
| Same group + khác topic | Rebalance liên tục — Kafka confused vì member khai subscription khác nhau |
| `min(partitions, consumers)` | Số consumer active tối đa = số partition. Consumer > partition thì dư thừa |
| Consumer Lag | Số message chưa commit offset. Tích lũy khi handler throw error |
| Generic `BaseTopicHandler<T>` | Cast `as T` 1 lần tại boundary, code sâu hơn fully typed |
| `as number` vs `Number()` | TypeScript cast là compile-time only. Cần `Number()` + `isNaN()` để convert runtime |
| `asMessageHandler()` | Arrow function giữ `this` binding khi truyền method làm callback |
