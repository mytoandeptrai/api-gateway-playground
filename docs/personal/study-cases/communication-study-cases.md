# Communication Study Cases #1

> Tổng hợp các bài toán giao tiếp giữa services trong microservices từ quá trình thiết kế hệ thống NextMart.

---

## 1. Service A cần đọc data của Service B liên tục

### Bài toán

`Product Service` cần trả về thông tin stock khi client gọi `GET /products`.  
Về mặt domain, stock thuộc về `Inventory Service` — không phải `Product Service`.

```
Client → GET /products
           ↓
     Product Service
           ↓
  Cần stock info từ đâu?
  → Inventory Service? → coupling chặt, B là bottleneck
  → Tự giữ copy?       → stale data, nhưng available
```

**Hậu quả nếu gọi trực tiếp mỗi request:**

- Product Service phụ thuộc runtime vào Inventory Service
- Inventory bị chậm/down → API products cũng bị ảnh hưởng
- Mỗi `GET /products` (list 20 sản phẩm) = 20 internal HTTP calls → latency nhân 20

---

### Giải pháp theo thứ tự ưu tiên

#### Option 1 — Cache data từ Inventory (TTL hoặc event-driven invalidation)

```
Product Service cache stock data với TTL = 60s
→ Request đến: đọc cache, không gọi Inventory
→ Cache miss hoặc TTL hết: gọi Inventory, lưu lại cache
```

**Phù hợp khi:** Stock thay đổi ít (vài lần/ngày).  
**Không phù hợp khi:** Stock thay đổi liên tục (flash sale, e-commerce) → cache stale quá thường xuyên.

---

#### Option 2 — CQRS Read Model qua Kafka ✅ (khuyến nghị cho NextMart)

Inventory Service publish event mỗi khi stock thay đổi.  
Product Service subscribe và build **read model riêng** trong DB của mình.

```
Inventory Service
  → stock thay đổi
  → publish: "inventory.stock_updated" { productId, available, reserved }
         ↓ Kafka
Product Service
  → consume event
  → UPDATE product_stock SET available = X WHERE product_id = Y
         ↓
Client → GET /products → Product Service đọc local DB, không gọi Inventory
```

**Bảng `product_stock` trong schema của Product Service:**

```sql
product_stock (
  product_id  UUID PRIMARY KEY,
  available   INT,
  updated_at  TIMESTAMP
)
```

**Ưu điểm:**
- Reads hoàn toàn local → không coupling runtime
- Kafka đã có sẵn trong NextMart → không tốn infrastructure mới
- Inventory publish event → nhiều consumer khác có thể dùng (Analytics, Search, ...)

**Nhược điểm:**
- Eventual consistency — stock hiển thị có thể trễ vài giây so với thực tế
- Cần handle trường hợp Product Service restart: consume lại events từ đầu hoặc snapshot

---

#### Option 3 — Data Replication / Materialized View (CDC)

Dùng Change Data Capture (Debezium) để sync trực tiếp từ DB của Inventory sang DB của Product.

```
Inventory DB → Debezium → Kafka → Product DB (replicated table)
```

**Khác biệt so với Option 2:**
- Option 2: Sync theo business event (chỉ sync field cần thiết)
- Option 3: Sync theo DB change (sync cả row, cả table)

**Không phù hợp cho NextMart hiện tại** vì:
- Cần thêm Debezium (chưa có trong stack)
- Over-engineering — Option 2 dùng Kafka đã có sẵn là đủ

---

#### Option 4 — Direct Service Call (cuối cùng)

```
Product Service → HTTP GET inventory-service/stock?productId=X
```

**Chỉ dùng khi:** Cần real-time tuyệt đối và chấp nhận coupling (ví dụ: trang chi tiết sản phẩm trước khi checkout).  
**Không dùng cho:** Product listing (N sản phẩm = N calls).

---

### Bảng so sánh

| Option | Infrastructure cần thêm | Consistency | Coupling runtime | Phù hợp NextMart |
|--------|--------------------------|-------------|------------------|-------------------|
| Cache | Redis (đã có) | Eventual (TTL) | Thấp | Chỉ nếu stock ít đổi |
| CQRS Read Model | Kafka (đã có) | Eventual (giây) | Không có | ✅ Khuyến nghị |
| Data Replication | Debezium (chưa có) | Eventual | Không có | Over-engineering |
| Direct Call | Không | Strong | Chặt | Tránh dùng cho list |

---

### Áp dụng cho NextMart

**Flow cụ thể:**

```
1. inventory-service publish "inventory.stock_updated" khi:
   - stock_reserved   (order mới đặt)
   - stock_released   (order bị cancel)
   - stock_confirmed  (delivery hoàn thành)
   - stock_adjusted   (admin cập nhật thủ công)

2. product-service consumer:
   @EventPattern('inventory.stock_updated')
   async onStockUpdated(event) {
     await this.productStockRepo.upsert(
       { productId: event.productId, available: event.available },
       ['productId'],
     );
   }

3. GET /products query local DB → không gọi sang Inventory
```

**Validation vẫn xảy ra ở đúng chỗ:**
- Trang listing: hiển thị stock từ read model (có thể stale vài giây — OK)
- Lúc đặt hàng: `inventory-service` check stock thật với Redlock → nguồn sự thật duy nhất

---

## 2. Frontend cần hiển thị stock cập nhật — có cần WebSocket không?

### Bài toán

Sau khi implement CQRS Read Model, `product-service` có stock khá fresh.  
Câu hỏi: Frontend có cần WebSocket để nhận real-time stock update không?

### Phân tích

```
Trang /products (listing)
  → Stale vài giây: CHẤP NHẬN ĐƯỢC
  → Validation thật xảy ra ở order creation, không phải ở đây
  → N users xem listing × broadcast mỗi stock change = load không cần thiết

Trang /orders/:id (order detail)
  → Cần real-time: ĐÃ CÓ (notification-service Socket.IO)
  → Khi saga hoàn thành/thất bại → user nhận notification ngay
```

**Nếu thêm WebSocket cho product listing:**

```
User A đặt hàng
  → inventory.stock_reserved published
  → notification-service broadcast "stock_updated" to all connected clients
  → 1000 users đang xem /products đều refetch
  → 1000 × GET /products = server chịu tải không cần thiết
```

Flash sale scenario còn tệ hơn: mỗi order = 1 broadcast = thundering herd.

### Giải pháp: `refetchInterval` + `refetchOnWindowFocus`

```typescript
const { data } = useQuery({
  queryKey: ['products'],
  queryFn: fetchProducts,
  refetchInterval: 30_000,     // polling 30s
  refetchOnWindowFocus: true,  // refetch khi user quay lại tab (default = true)
});
```

**Tại sao `refetchOnWindowFocus` cover phần lớn case thực tế:**

```
User mở tab /products → thấy stock = 5
User mở tab khác → đặt hàng thành công
User quay lại tab /products → focus event → tự động refetch → stock = 4 ✅
```

Không cần WebSocket, không cần push từ server.

### Khi nào mới cần WebSocket cho stock?

| Scenario | Cần WebSocket? | Lý do |
|----------|----------------|-------|
| Product listing | Không | Stale vài giây OK, polling đủ |
| Flash sale countdown | Có thể | UX yêu cầu real-time "chỉ còn X sản phẩm" |
| Order status | Đã có | notification-service Socket.IO |
| Admin inventory dashboard | Có thể | Admin cần real-time để quản lý |

---

## 3. Nguyên tắc chọn cơ chế giao tiếp

### Câu hỏi để phân loại

> **"Data này cần đúng tới mức nào, vào đúng lúc nào?"**

```
Strong consistency, real-time  →  Synchronous HTTP (trả về ngay, block nếu cần)
Eventual consistency OK        →  Async Kafka event (decouple, non-blocking)
Read-heavy, chậm thay đổi      →  Cache (TTL)
Read-heavy, thay đổi liên tục  →  CQRS Read Model (local copy, fresh qua events)
```

### Bảng tổng hợp patterns

| Pattern | Khi nào dùng | Ví dụ NextMart |
|---------|-------------|----------------|
| Sync HTTP | Cần kết quả ngay, chấp nhận coupling | Checkout gọi Inventory check stock |
| Async Kafka event | Trigger action, decouple services | Order created → start saga |
| CQRS Read Model | Service A cần đọc data của B thường xuyên | Product Service đọc stock của Inventory |
| Cache | Data ít thay đổi, đọc nhiều | Route config trong API Gateway |
| WebSocket/SSE | User cần biết ngay khi state thay đổi | Order status update |
| Polling (frontend) | Update không cần tức thời | Stock hiển thị trên product listing |

---

## Tóm tắt nhanh

| Khái niệm | Một câu ghi nhớ |
|-----------|----------------|
| CQRS Read Model | Service A giữ bản copy data của B, cập nhật qua Kafka event. Reads local, không coupling runtime. |
| Eventual consistency cho listing | Stale vài giây ở product listing là OK. Validation thật xảy ra ở order creation. |
| WebSocket cho stock | Overkill cho listing. Cần khi UX yêu cầu real-time tuyệt đối (flash sale, admin dashboard). |
| refetchOnWindowFocus | User quay lại tab → tự refetch. Cover phần lớn case mà không cần push từ server. |
| Nguồn sự thật duy nhất | Inventory Service là nơi validate stock thật. Product Service chỉ giữ read model để display. |
