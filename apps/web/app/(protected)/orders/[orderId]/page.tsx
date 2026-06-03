"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@repo/ui/components/button";
import { Badge } from "@repo/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  ArrowLeft,
  Package,
  MapPin,
  CreditCard,
  Truck,
  RotateCcw,
} from "lucide-react";
import { OrderStatusBadge } from "@/components/order/order-status-badge";
import { OrderTimeline } from "@/components/order/order-timeline";
import { useGetOrderQuery } from "@/services/order";
import { useOrderSocket } from "@/hooks/use-order-socket";
import { getRefundByOrderIdApi } from "@/services/refund/api";
import type { RefundStatus } from "@/services/refund/types.dto";
import { formatPrice, formatDate } from "@/utils/format";

const REFUND_STATUS_CONFIG: Record<
  RefundStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  REFUND_PENDING: { label: "Đang xử lý", variant: "outline" },
  REFUND_APPROVED: { label: "Đã duyệt", variant: "default" },
  REFUND_REJECTED: { label: "Bị từ chối", variant: "destructive" },
  REFUNDED: { label: "Đã hoàn tiền", variant: "secondary" },
};

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();

  const { data, isLoading } = useGetOrderQuery(orderId);
  useOrderSocket(orderId);

  const order = data?.data;

  const hasRefundStatus = [
    "DELIVERED",
    "REFUND_REQUESTED",
    "REFUNDED",
  ].includes(order?.status ?? "");
  const { data: refundData } = useQuery({
    queryKey: ["refund", orderId],
    queryFn: () => getRefundByOrderIdApi(orderId),
    enabled: hasRefundStatus,
  });
  const refund = refundData?.data ?? null;

  const canRefund =
    order?.status === "DELIVERED" &&
    order.deliveredAt &&
    !refund &&
    Date.now() - new Date(order.deliveredAt).getTime() <=
      7 * 24 * 60 * 60 * 1000;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-2xl space-y-4">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Không tìm thấy đơn hàng</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/orders")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-base font-bold">
              #{order.id.slice(0, 8).toUpperCase()}
            </h1>
            <p className="text-xs text-muted-foreground">
              {formatDate(order.createdAt)}
            </p>
          </div>
          <div className="ml-auto">
            <OrderStatusBadge status={order.status} />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-4">
        {/* Timeline */}
        <Card>
          <CardContent className="pt-6 pb-4 px-4">
            <OrderTimeline status={order.status} />
          </CardContent>
        </Card>

        {/* Cancel reason */}
        {order.status === "CANCELLED" && order.cancelReason && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            Lý do hủy: {order.cancelReason}
          </div>
        )}

        {/* Refund status */}
        {refund && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" /> Hoàn tiền
                </span>
                <Badge variant={REFUND_STATUS_CONFIG[refund.status].variant}>
                  {REFUND_STATUS_CONFIG[refund.status].label}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              {refund.status === "REFUNDED" && (
                <p className="text-green-600 font-medium">
                  Đã hoàn tiền thành công
                </p>
              )}
              {refund.status === "REFUND_REJECTED" && refund.reviewNote && (
                <p className="text-destructive">
                  Lý do từ chối: {refund.reviewNote}
                </p>
              )}
              {(refund.status === "REFUND_PENDING" ||
                refund.status === "REFUND_APPROVED") && (
                <p className="text-muted-foreground">Yêu cầu đang được xử lý</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Product */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="w-4 h-4" /> Sản phẩm
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex justify-between">
              <span className="font-medium">{order.productName}</span>
              <span className="text-sm text-muted-foreground">
                x{order.quantity}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Đơn giá</span>
              <span>{formatPrice(order.unitPrice)}</span>
            </div>
            <div className="flex justify-between font-bold pt-1 border-t">
              <span>Tổng cộng</span>
              <span className="text-primary">
                {formatPrice(order.totalAmount)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Shipping */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4" /> Địa chỉ giao hàng
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-0.5">
            <p className="font-medium">{order.shippingAddress.fullName}</p>
            <p className="text-muted-foreground">
              {order.shippingAddress.phone}
            </p>
            <p className="text-muted-foreground">
              {order.shippingAddress.address}, {order.shippingAddress.city}
            </p>
          </CardContent>
        </Card>

        {/* Tracking */}
        {order.trackingId && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Truck className="w-4 h-4" /> Mã vận đơn
              </CardTitle>
            </CardHeader>
            <CardContent>
              <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                {order.trackingId}
              </code>
            </CardContent>
          </Card>
        )}

        {/* Payment deadline */}
        {order.status === "PENDING_PAYMENT" && (
          <div className="rounded-lg bg-muted p-3 text-sm flex items-center gap-2">
            <CreditCard className="w-4 h-4 shrink-0" />
            <span>
              Thanh toán trước:{" "}
              <strong>{formatDate(order.paymentDeadline)}</strong>
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {order.status === "PENDING_PAYMENT" && (
            <Button
              className="flex-1"
              onClick={() => router.push(`/payment/${order.id}`)}
            >
              Thanh toán ngay
            </Button>
          )}
          {canRefund && (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => router.push(`/orders/${order.id}/refund`)}
            >
              Yêu cầu hoàn tiền
            </Button>
          )}
          {order.status === "DELIVERED" && !canRefund && order.deliveredAt && (
            <p className="text-sm text-muted-foreground text-center w-full">
              Đã hết thời hạn yêu cầu hoàn tiền
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
