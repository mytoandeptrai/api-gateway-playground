"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { FormWrapper } from "@repo/ui/components/form";
import { FormInput } from "@repo/ui/components/form-fields/form-input";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { useLoginMutation } from "@/services/auth";
import { useSessionStore } from "@/store/use-session-store";

const loginSchema = z.object({
  email: z.email("Email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { mutateAsync, isPending } = useLoginMutation();
  const { setToken } = useSessionStore();

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      const res = await mutateAsync(data);
      setToken(res.data.accessToken);
      router.replace("/products");
    } catch {
      toast.error("Email hoặc mật khẩu không đúng");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">NextMart</CardTitle>
          <p className="text-muted-foreground text-sm">Đăng nhập để tiếp tục</p>
        </CardHeader>
        <CardContent>
          <FormWrapper form={form} onSubmit={onSubmit} className="space-y-4">
            <FormInput
              control={form.control}
              name="email"
              label="Email"
              type="email"
              placeholder="test@nextmart.com"
              required
            />
            <FormInput
              control={form.control}
              name="password"
              label="Mật khẩu"
              type="password"
              placeholder="Nhập mật khẩu"
              required
            />
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Đang đăng nhập..." : "Đăng nhập"}
            </Button>
          </FormWrapper>
        </CardContent>
      </Card>
    </div>
  );
}
