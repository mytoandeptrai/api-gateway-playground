'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@repo/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/card';
import { FormWrapper } from '@repo/ui/components/form';
import { FormInput } from '@repo/ui/components/form-fields/form-input';
import { Skeleton } from '@repo/ui/components/skeleton';
import { ArrowLeft } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';
import { useGetProductByIdQuery } from '@/services/product';
import { useCreateOrderMutation } from '@/services/order';
import { formatPrice } from '@/utils/format';

const checkoutSchema = z.object({
  fullName: z.string().min(1, 'Vui lòng nhập họ tên'),
  phone: z.string().regex(/^0\d{9}$/, 'Số điện thoại không hợp lệ (10 số, bắt đầu 0)'),
  address: z.string().min(1, 'Vui lòng nhập địa chỉ'),
  city: z.string().min(1, 'Vui lòng nhập thành phố'),
});

type CheckoutForm = z.infer<typeof checkoutSchema>;

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = searchParams.get('productId') ?? '';

  const { data: productRes, isLoading } = useGetProductByIdQuery(productId);
  const { mutateAsync, isPending } = useCreateOrderMutation();

  const product = productRes?.data;

  const form = useForm<CheckoutForm>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { fullName: '', phone: '', address: '', city: '' },
  });

  const onSubmit = async (data: CheckoutForm) => {
    if (!productId) return;
    try {
      const res = await mutateAsync({
        productId,
        quantity: 1,
        shippingAddress: data,
      });
      const orderId = res?.data?.orderId;
      router.push(`/payment/${orderId}`);
    } catch {
      toast.error('Đặt hàng thất bại, vui lòng thử lại');
    }
  };

  if (!productId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Không tìm thấy sản phẩm</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-bold">Thanh toán</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
        {/* Order summary */}
        <Card>
          <CardHeader><CardTitle className="text-base">Thông tin đơn hàng</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-16" />
            ) : product ? (
              <div className="flex justify-between items-start gap-4">
                <div>
                  <p className="font-semibold">{product.name}</p>
                  <p className="text-sm text-muted-foreground">Số lượng: 1</p>
                </div>
                <p className="text-lg font-bold text-primary shrink-0">{formatPrice(product.price)}</p>
              </div>
            ) : (
              <p className="text-destructive text-sm">Không tìm thấy sản phẩm</p>
            )}
          </CardContent>
        </Card>

        {/* Shipping form */}
        <Card>
          <CardHeader><CardTitle className="text-base">Địa chỉ giao hàng</CardTitle></CardHeader>
          <CardContent>
            <FormWrapper form={form} onSubmit={onSubmit} className="space-y-4">
              <FormInput control={form.control} name="fullName" label="Họ và tên" placeholder="Nguyễn Văn A" required />
              <FormInput control={form.control} name="phone" label="Số điện thoại" placeholder="0912345678" required />
              <FormInput control={form.control} name="address" label="Địa chỉ" placeholder="123 Lê Lợi" required />
              <FormInput control={form.control} name="city" label="Thành phố" placeholder="TP. Hồ Chí Minh" required />

              <div className="pt-2 border-t flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Tổng tiền</p>
                  <p className="text-xl font-bold text-primary">
                    {product ? formatPrice(product.price) : '—'}
                  </p>
                </div>
                <Button type="submit" disabled={isPending || !product} className="min-w-40">
                  {isPending ? 'Đang xử lý...' : 'Tiến hành thanh toán'}
                </Button>
              </div>
            </FormWrapper>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
