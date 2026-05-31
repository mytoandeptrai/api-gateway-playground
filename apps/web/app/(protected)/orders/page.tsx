"use client";

import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";
import { ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { OrderStatusBadge } from "@/components/order/order-status-badge";
import { useGetOrdersQuery } from "@/services/order";
import { useOrderSocket } from "@/hooks/use-order-socket";
import { formatPrice, formatDate } from "@/utils/format";

export default function OrderListPage() {
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useGetOrdersQuery();

  useOrderSocket();

  const orders = data?.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Đơn hàng của tôi</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/products")}
          >
            Tiếp tục mua sắm
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl space-y-3">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}

        {isError && (
          <div className="text-center py-20 space-y-3">
            <p className="text-muted-foreground">Không thể tải đơn hàng</p>
            <Button variant="outline" onClick={() => refetch()}>
              Thử lại
            </Button>
          </div>
        )}

        {!isLoading && !isError && orders.length === 0 && (
          <div className="text-center py-20 space-y-4">
            <ShoppingBag className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Bạn chưa có đơn hàng nào</p>
            <Button onClick={() => router.push("/products")}>
              Khám phá sản phẩm
            </Button>
          </div>
        )}

        {!isLoading &&
          !isError &&
          orders.map((order) => (
            <Card
              key={order.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => router.push(`/orders/${order.id}`)}
            >
              <CardContent className="p-4 flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1 min-w-0">
                  <p className="font-semibold truncate">{order.productName}</p>
                  <p className="text-sm text-muted-foreground">
                    #{order.id.slice(0, 8).toUpperCase()} ·{" "}
                    {formatDate(order.createdAt)}
                  </p>
                  <p className="text-sm font-medium text-primary">
                    {formatPrice(order.totalAmount)}
                  </p>
                </div>
                <OrderStatusBadge status={order.status} />
              </CardContent>
            </Card>
          ))}
      </main>
    </div>
  );
}
