import { Check, Loader2, X } from "lucide-react";
import type { OrderStatus } from "@/services/order/types.dto";

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "PENDING_PAYMENT", label: "Tạo đơn" },
  { status: "PAYMENT_RECEIVED", label: "Thanh toán" },
  { status: "CONFIRMED", label: "Xác nhận" },
  { status: "PREPARING", label: "Đóng gói" },
  { status: "SHIPPED", label: "Vận chuyển" },
  { status: "DELIVERED", label: "Đã giao" },
];

const ORDER_INDEX: Record<OrderStatus, number> = {
  PENDING_PAYMENT: 0,
  PAYMENT_RECEIVED: 1,
  CONFIRMED: 2,
  PREPARING: 3,
  SHIPPED: 4,
  DELIVERED: 5,
  CANCELLED: -1,
  REFUND_REQUESTED: 5,
  REFUNDED: 5,
};

export function OrderTimeline({ status }: { status: OrderStatus }) {
  const currentIdx = ORDER_INDEX[status];
  const cancelled = status === "CANCELLED";
  const isFinalStep = ["DELIVERED", "REFUNDED", "REFUND_REQUESTED"].includes(status);

  return (
    <div className="flex items-start gap-0 w-full overflow-x-auto pb-2">
      {STEPS.map((step, i) => {
        const done = !cancelled && (i < currentIdx || (isFinalStep && i === currentIdx));
        const active = !cancelled && !done && i === currentIdx;

        return (
          <div
            key={step.status}
            className="flex flex-col items-center flex-1 min-w-0"
          >
            <div className="flex items-center w-full">
              {i > 0 && (
                <div
                  className={`h-0.5 flex-1 ${done || active ? "bg-primary" : "bg-muted"}`}
                />
              )}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 ${
                  done
                    ? "bg-primary border-primary text-primary-foreground"
                    : active
                      ? "border-primary text-primary"
                      : "border-muted text-muted-foreground"
                }`}
              >
                {done ? (
                  <Check className="w-4 h-4" />
                ) : active ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span className="text-xs">{i + 1}</span>
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-0.5 flex-1 ${done ? "bg-primary" : "bg-muted"}`}
                />
              )}
            </div>
            <span
              className={`text-xs mt-1 text-center ${active ? "text-primary font-medium" : done ? "text-foreground" : "text-muted-foreground"}`}
            >
              {step.label}
            </span>
          </div>
        );
      })}

      {cancelled && (
        <div className="flex flex-col items-center flex-1 min-w-0">
          <div className="flex items-center w-full">
            <div className="h-0.5 flex-1 bg-muted" />
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 border-destructive bg-destructive text-destructive-foreground">
              <X className="w-4 h-4" />
            </div>
            <div className="h-0.5 flex-1 bg-muted" />
          </div>
          <span className="text-xs mt-1 text-destructive font-medium">
            Đã hủy
          </span>
        </div>
      )}
    </div>
  );
}
