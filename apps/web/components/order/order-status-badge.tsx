import { Badge } from "@repo/ui/components/badge";
import type { OrderStatus } from "@/services/order/types.dto";

const STATUS_CONFIG: Record<
  OrderStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  PENDING_PAYMENT: { label: "Chờ thanh toán", variant: "outline" },
  PAYMENT_RECEIVED: { label: "Đã thanh toán", variant: "default" },
  CONFIRMED: { label: "Đã xác nhận", variant: "default" },
  PREPARING: { label: "Đang đóng gói", variant: "secondary" },
  SHIPPED: { label: "Đang giao hàng", variant: "secondary" },
  DELIVERED: { label: "Đã giao", variant: "default" },
  CANCELLED: { label: "Đã hủy", variant: "destructive" },
  REFUND_REQUESTED: { label: "Yêu cầu hoàn tiền", variant: "outline" },
  REFUNDED: { label: "Đã hoàn tiền", variant: "secondary" },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    variant: "outline" as const,
  };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
