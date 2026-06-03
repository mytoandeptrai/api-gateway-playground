"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { verifyPaymentReturnApi } from "@/services/payment/api";

type CallbackStatus = "loading" | "success" | "failed";

export default function PaymentCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<CallbackStatus>("loading");
  const [orderId, setOrderId] = useState<string | null>(null);
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const txnRef = searchParams.get("vnp_TxnRef");
    setOrderId(txnRef);

    // Forward all VNPay params to backend to verify + process payment
    const params = Object.fromEntries(searchParams.entries());

    verifyPaymentReturnApi(params)
      .then((res) => {
        if (res.data?.RspCode === "00") {
          setStatus("success");
          toast.success("Thanh toán thành công!");
        } else {
          setStatus("failed");
          toast.error("Thanh toán thất bại hoặc bị hủy.");
        }
      })
      .catch(() => {
        setStatus("failed");
        toast.error("Có lỗi xảy ra khi xác nhận thanh toán.");
      });
  }, [searchParams]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">
          Đang xử lý kết quả thanh toán...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>
            {status === "success"
              ? "Thanh toán thành công"
              : "Thanh toán thất bại"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-6xl">{status === "success" ? "✅" : "❌"}</p>
          <p className="text-sm text-muted-foreground">
            {status === "success"
              ? "Đơn hàng của bạn đang được xử lý."
              : "Giao dịch không thành công. Vui lòng thử lại."}
          </p>
          <div className="flex flex-col gap-2">
            {status === "success" && orderId && (
              <Button onClick={() => router.replace(`/orders/${orderId}`)}>
                Xem đơn hàng
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => router.replace("/products")}
            >
              Về trang sản phẩm
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
