"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Send } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Textarea } from "@repo/ui/components/textarea";
import { Label } from "@repo/ui/components/label";
import { InputFileDropzone } from "@/components/ui/input-file-dropzone";
import { useGetOrderQuery } from "@/services/order";
import { createRefundApi, getRefundByOrderIdApi } from "@/services/refund/api";
import { useSessionStore } from "@/store/use-session-store";

function decodeJwt(token: string): { sub?: string; email?: string } | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    return JSON.parse(atob(part));
  } catch {
    return null;
  }
}

export default function RefundPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const token = useSessionStore((s) => s.token);

  const { data: orderData, isLoading: orderLoading } =
    useGetOrderQuery(orderId);
  const order = orderData?.data;

  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Guard: if already has refund or not eligible, redirect
  useEffect(() => {
    if (!order) return;
    if (order.status !== "DELIVERED") {
      router.replace(`/orders/${orderId}`);
      return;
    }
    const withinWindow =
      order.deliveredAt &&
      Date.now() - new Date(order.deliveredAt).getTime() <=
        7 * 24 * 60 * 60 * 1000;
    if (!withinWindow) {
      router.replace(`/orders/${orderId}`);
      return;
    }
    // Check existing refund request
    getRefundByOrderIdApi(orderId)
      .then((res) => {
        if (res.data) router.replace(`/orders/${orderId}`);
      })
      .catch(() => {});
  }, [order, orderId, router]);

  const handleSubmit = async () => {
    if (reason.trim().length < 20) {
      toast.error("Lý do phải có ít nhất 20 ký tự");
      return;
    }
    if (files.length === 0) {
      toast.error("Vui lòng đính kèm ít nhất 1 ảnh");
      return;
    }

    if (!token || !order) return;
    const jwtPayload = decodeJwt(token);
    const userId = jwtPayload?.sub ?? "";
    const userEmail = jwtPayload?.email ?? "";

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("orderId", orderId);
      formData.append("userId", userId);
      formData.append("userEmail", userEmail);
      formData.append("reason", reason.trim());
      formData.append(
        "deliveredAt",
        order.deliveredAt ?? new Date().toISOString(),
      );
      files.forEach((f) => formData.append("files", f));

      await createRefundApi(formData);
      toast.success("Yêu cầu hoàn tiền đã được gửi");
      router.replace(`/orders/${orderId}`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Gửi yêu cầu thất bại, vui lòng thử lại";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (orderLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-lg space-y-4">
          <Skeleton className="h-10 w-40" />
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
            onClick={() => router.push(`/orders/${orderId}`)}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-base font-bold">Yêu cầu hoàn tiền</h1>
            <p className="text-xs text-muted-foreground">
              #{orderId.slice(0, 8).toUpperCase()} — {order.productName}
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Lý do hoàn tiền</CardTitle>
          </CardHeader>
          <CardContent>
            <Label htmlFor="reason" className="sr-only">
              Lý do
            </Label>
            <Textarea
              id="reason"
              placeholder="Mô tả lý do bạn muốn hoàn tiền (tối thiểu 20 ký tự)..."
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">
              {reason.length}/20 ký tự tối thiểu
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Ảnh minh chứng</CardTitle>
          </CardHeader>
          <CardContent>
            <InputFileDropzone
              value={files}
              onValueChange={setFiles}
              accept={{ "image/jpeg": [], "image/jpg": [], "image/png": [] }}
              maxSize={5 * 1024 * 1024}
              maxFiles={3}
              multiple
            />
            <p className="text-xs text-muted-foreground mt-2">
              Tối đa 3 ảnh, mỗi ảnh không quá 5MB. Chấp nhận jpg, jpeg, png.
            </p>
          </CardContent>
        </Card>

        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={
            submitting || reason.trim().length < 20 || files.length === 0
          }
        >
          <Send className="w-4 h-4 mr-2" />
          {submitting ? "Đang gửi..." : "Gửi yêu cầu hoàn tiền"}
        </Button>
      </main>
    </div>
  );
}
