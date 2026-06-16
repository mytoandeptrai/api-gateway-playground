"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useGetPaymentStatusQuery } from "@/services/payment";
import { useGetOrderQuery } from "@/services/order";
import { useOrderSocket } from "@/hooks/use-order-socket";
import { formatPrice } from "@/utils/format";

function useCountdown(deadlineIso: string | null | undefined) {
  const [seconds, setSeconds] = useState<number>(0);

  useEffect(() => {
    if (!deadlineIso) return;
    const calc = () =>
      Math.max(
        0,
        Math.floor((new Date(deadlineIso).getTime() - Date.now()) / 1000),
      );
    setSeconds(calc());
    const id = setInterval(() => setSeconds(calc()), 1000);
    return () => clearInterval(id);
  }, [deadlineIso]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return { seconds, display: `${mm}:${ss}` };
}

export default function PaymentPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const redirected = useRef(false);

  const { data: orderRes } = useGetOrderQuery(orderId);
  const { data: paymentRes, isLoading } = useGetPaymentStatusQuery(orderId);

  const order = orderRes?.data;
  const payment = paymentRes?.data;
  const { seconds, display } = useCountdown(
    order?.paymentDeadline ?? payment?.expiresAt,
  );

  useOrderSocket(orderId);

  // Redirect when paid
  useEffect(() => {
    if (redirected.current) return;
    if (payment?.status === "COMPLETED") {
      redirected.current = true;
      toast.success("Thanh toán thành công!");
      router.replace(`/orders/${orderId}`);
    }
    if (
      payment?.status === "EXPIRED" ||
      (seconds === 0 && payment?.status === "PENDING")
    ) {
      redirected.current = true;
    }
  }, [payment?.status, seconds, orderId, router]);

  const settled = ["COMPLETED", "FAILED", "EXPIRED"].includes(payment?.status ?? "");
  const expired = seconds === 0 || settled;
  const qrUrl = payment?.qrUrl;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Thanh toán đơn hàng</CardTitle>
          {order && (
            <p className="text-muted-foreground text-sm">
              {order.productName} — {formatPrice(order.totalAmount)}
            </p>
          )}
        </CardHeader>

        <CardContent className="space-y-5 flex flex-col items-center">
          {isLoading ? (
            <Skeleton className="w-56 h-56 rounded-lg" />
          ) : expired ? (
            <div className="text-center space-y-3 py-4">
              <p className="text-destructive font-semibold">
                Đã hết thời gian thanh toán
              </p>
              <p className="text-sm text-muted-foreground">
                Đơn hàng sẽ được tự động hủy
              </p>
              <Button
                variant="outline"
                onClick={() => router.replace("/products")}
              >
                Về trang sản phẩm
              </Button>
            </div>
          ) : qrUrl ? (
            <>
              <div className="p-3 bg-white rounded-lg border">
                <QRCodeSVG value={qrUrl} size={220} />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Quét QR bằng ứng dụng ngân hàng để thanh toán
              </p>
              <a
                href={qrUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full"
              >
                <Button variant="outline" className="w-full" size="sm">
                  Thanh toán qua trình duyệt (Sandbox)
                </Button>
              </a>
            </>
          ) : (
            <div className="text-center py-8 space-y-2">
              <Skeleton className="w-56 h-56 rounded-lg" />
              <p className="text-sm text-muted-foreground">Đang tạo mã QR...</p>
            </div>
          )}

          {!expired && (
            <div
              className={`text-3xl font-mono font-bold ${seconds < 120 ? "text-destructive" : "text-foreground"}`}
            >
              {display}
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.replace("/orders")}
          >
            Xem đơn hàng của tôi
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
