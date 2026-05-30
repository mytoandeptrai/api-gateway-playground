"use client";

import { ProductCard } from "@/components/product/product-card";
import { useLogoutMutation } from "@/services/auth";
import { useGetProductsQuery } from "@/services/product";
import { useSessionStore } from "@/store/use-session-store";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function ProductListPage() {
  const router = useRouter();
  const reset = useSessionStore((s) => s.reset);
  const { data, isLoading, isError, refetch } = useGetProductsQuery();
  const { mutateAsync, isPending } = useLogoutMutation();

  const handleLogout = async () => {
    try {
      await mutateAsync();
    } catch {
      // ignore — clear local state regardless
    }
    reset();
    router.replace("/login");
    toast.success("Đã đăng xuất");
  };

  const products = data?.data?.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">NextMart</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            disabled={isPending}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Đăng xuất
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold mb-6">Sản phẩm</h2>

        {isLoading && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-72 rounded-xl" />
            ))}
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p className="text-muted-foreground">Không thể tải sản phẩm</p>
            <Button variant="outline" onClick={() => refetch()}>
              Thử lại
            </Button>
          </div>
        )}

        {!isLoading && !isError && products.length === 0 && (
          <p className="text-muted-foreground text-center py-20">
            Chưa có sản phẩm nào
          </p>
        )}

        {!isLoading && !isError && products.length > 0 && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
