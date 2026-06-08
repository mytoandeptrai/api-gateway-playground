# Kafka Lab

Standalone lab để quan sát hành vi Kafka trong thực tế: partition distribution, rebalancing, consumer lag, message ordering.

Hoàn toàn tách biệt khỏi source code dự án — không ảnh hưởng đến bất kỳ service nào.

---

## Yêu cầu

- Docker đang chạy với infrastructure (`pnpm only-infra`)
- Node.js >= 18

---

## Setup

```bash
cd kafka-lab
npm install
./setup.sh 3   # tạo topic lab.orders với 3 partitions
```

Kiểm tra topic đã tạo trên Kafka UI: http://localhost:1116

---

## Files

| File          | Mô tả                                     |
| ------------- | ----------------------------------------- |
| `setup.sh`    | Tạo topic `lab.orders` với N partitions   |
| `producer.js` | Gửi messages với key cố định theo orderId |
| `consumer.js` | Consumer có thể cấu hình delay, groupId   |

---

## Env vars

### producer.js

| Var             | Default        | Mô tả                                             |
| --------------- | -------------- | ------------------------------------------------- |
| `MESSAGE_COUNT` | `30`           | Số message gửi                                    |
| `INTERVAL_MS`   | `500`          | Delay giữa các message (ms)                       |
| `BURST`         | `false`        | Gửi tất cả không delay                            |
| `SKEW`          | `false`        | Tất cả message dùng cùng 1 key → cùng 1 partition |
| `INJECT_POISON` | `false`        | Chèn 1 poison pill message vào giữa               |
| `POISON_KEY`    | `order-POISON` | Key của poison pill message                       |

### consumer.js

| Var             | Default     | Mô tả                                               |
| --------------- | ----------- | --------------------------------------------------- |
| `CONSUMER_ID`   | `1`         | Label hiển thị trong log                            |
| `GROUP_ID`      | `lab-group` | Consumer group                                      |
| `DELAY_MS`      | `0`         | Giả lập xử lý chậm (ms)                             |
| `POISON_KEY`    | off         | Messages có key này luôn fail, không bao giờ commit |
| `CRASH_AFTER_N` | `0`         | Exit không commit sau khi xử lý N messages          |

---

## Kịch bản

### 1. Partition distribution

Quan sát cách Kafka phân chia partition cho từng consumer trong cùng group.

```bash
# 3 terminal riêng
CONSUMER_ID=1 node consumer.js
CONSUMER_ID=2 node consumer.js
CONSUMER_ID=3 node consumer.js

# Terminal khác
node producer.js
```

Kết quả mong đợi: mỗi consumer nhận đúng 1 partition. Log hiển thị `REBALANCE DONE — assigned: lab.orders:[X]`.

---

### 2. Consumer crash & rebalance

Quan sát Kafka tự động redistribute partition khi 1 consumer bị kill.

```bash
CONSUMER_ID=1 node consumer.js
CONSUMER_ID=2 node consumer.js
CONSUMER_ID=3 node consumer.js

MESSAGE_COUNT=60 node producer.js

# Khi producer đang chạy → Ctrl+C terminal C2
```

Kết quả mong đợi: C1 và C3 log `REBALANCING` → `REBALANCE DONE` với partition mới. Không mất message nào.

---

### 3. Consumer lag (slow consumer)

Quan sát lag hình thành khi 1 consumer xử lý chậm hơn tốc độ produce.

```bash
CONSUMER_ID=1 DELAY_MS=3000 node consumer.js
CONSUMER_ID=2 node consumer.js
CONSUMER_ID=3 node consumer.js

BURST=true MESSAGE_COUNT=30 node producer.js
```

Kết quả mong đợi: partition của C1 tích lũy lag trên Kafka UI, C2 và C3 lag = 0.

---

### 4. Message ordering

Kiểm chứng thứ tự message được đảm bảo trong cùng 1 partition.

```bash
CONSUMER_ID=1 node consumer.js

node producer.js
```

Kết quả mong đợi: tất cả message cùng key (ví dụ `order-A`) vào cùng 1 partition, `seq` tăng dần liên tục không bị đảo thứ tự.

---

### 5. Thêm consumer khi hệ thống đang chạy

Quan sát rebalance khi scale out consumer giữa chừng.

```bash
CONSUMER_ID=1 node consumer.js
CONSUMER_ID=2 node consumer.js

MESSAGE_COUNT=100 INTERVAL_MS=300 node producer.js

# Sau ~10 giây, mở terminal mới
CONSUMER_ID=3 node consumer.js
```

Kết quả mong đợi: C1 và C2 trigger rebalance, sau đó 3 consumer mỗi người giữ 1 partition. Producer không bị gián đoạn.

---

### 6. Hai consumer group độc lập

Quan sát 2 group đọc cùng topic nhưng offset hoàn toàn độc lập.

```bash
CONSUMER_ID=A GROUP_ID=lab-group node consumer.js
CONSUMER_ID=X GROUP_ID=lab-group-2 node consumer.js

node producer.js
```

Kết quả mong đợi: cả A và X đều nhận đầy đủ tất cả message. Offset của 2 group không ảnh hưởng lẫn nhau — kiểm tra trên Kafka UI tab "Consumer Groups".

---

### 7. Poison Pill

Quan sát điều gì xảy ra khi 1 message luôn fail — partition bị block, lag tăng mãi trong khi các partition khác vẫn chạy bình thường. Đây là lý do cần DLQ.

```bash
# Consumer với POISON_KEY — messages có key này sẽ luôn throw
CONSUMER_ID=1 POISON_KEY=order-POISON node consumer.js
CONSUMER_ID=2 node consumer.js
CONSUMER_ID=3 node consumer.js

# Producer chèn 1 poison pill vào giữa luồng message bình thường
INJECT_POISON=true MESSAGE_COUNT=30 node producer.js
```

Kết quả mong đợi: consumer nhận được `order-POISON` log `☠️ POISON PILL` và throw → partition đó bị stuck, lag tăng. C2 và C3 vẫn xử lý bình thường. Kafka UI cho thấy lag chỉ tăng ở đúng 1 partition.

---

### 8. Duplicate Processing (at-least-once)

Quan sát message bị xử lý 2 lần khi consumer crash trước khi commit. Đây là lý do cần idempotency (`ProcessedEvent` table).

```bash
# Consumer crash sau khi xử lý 5 messages mà không commit message thứ 5
CONSUMER_ID=1 CRASH_AFTER_N=5 node consumer.js

# Gửi 20 messages
node producer.js
```

Sau khi C1 tự exit với log `💥 CRASH_BEFORE_COMMIT`, restart lại:

```bash
CONSUMER_ID=1 node consumer.js
```

Kết quả mong đợi: message thứ 5 xuất hiện lại trong log với cùng `seq` — bị xử lý 2 lần. Đây chính là "at-least-once delivery" trong thực tế.

---

### 9. Partition Skew

Quan sát khi key không được phân phối đều — tất cả message vào cùng 1 partition, 1 consumer ôm hết việc trong khi 2 consumer còn lại idle.

```bash
CONSUMER_ID=1 node consumer.js
CONSUMER_ID=2 node consumer.js
CONSUMER_ID=3 node consumer.js

# Tất cả message dùng key = "order-A"
SKEW=true BURST=true MESSAGE_COUNT=30 node producer.js
```

Kết quả mong đợi: producer log cho thấy tất cả message → cùng 1 partition. Chỉ 1 consumer xử lý, 2 consumer còn lại không có log nào. Kafka UI: lag chỉ xuất hiện ở 1 partition.

---

### 10. Graceful vs Ungraceful Shutdown

Quan sát sự khác biệt về thời gian rebalance giữa tắt đúng cách (Ctrl+C) và force kill.

```bash
CONSUMER_ID=1 node consumer.js
CONSUMER_ID=2 node consumer.js
CONSUMER_ID=3 node consumer.js

MESSAGE_COUNT=100 INTERVAL_MS=300 node producer.js
```

**Graceful (Ctrl+C):**

```bash
# Ctrl+C trên terminal C2
# → consumer gọi disconnect() → gửi LeaveGroup lên broker
# → C1 và C3 nhận REBALANCING ngay lập tức (< 1s)
```

**Ungraceful (kill -9):**

```bash
# Lấy PID của C2
ps aux | grep consumer.js

# Force kill — không gửi được LeaveGroup
kill -9 <PID>

# → C1 và C3 chờ sessionTimeout (10s) mới thấy REBALANCING
```

Kết quả mong đợi: graceful rebalance xảy ra ngay lập tức, ungraceful chờ ~10 giây. Trong production với `sessionTimeout=1200000ms` (20 phút), ungraceful crash sẽ làm partition không được xử lý trong 20 phút.

---

## Quan sát trên Kafka UI

http://localhost:1116

| Tab                             | Xem gì                                |
| ------------------------------- | ------------------------------------- |
| Topics → lab.orders → Messages  | Message browser, partition assignment |
| Topics → lab.orders → Consumers | Consumer groups đang đọc topic này    |
| Consumer Groups                 | Offset và lag theo từng partition     |

---

## Reset

Xóa topic để chạy lại từ đầu:

```bash
docker exec api-gateway-kafka kafka-topics \
  --bootstrap-server localhost:9092 \
  --delete --topic lab.orders

./setup.sh 3
```
