"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardFooter } from "@repo/ui/components/card";
import { useRouter } from "next/navigation";
import type { Product } from "@/services/product/types.dto";

const formatPrice = (price: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    price,
  );

export function ProductCard({ product }: { product: Product }) {
  const router = useRouter();
  const outOfStock = product.available === 0;

  return (
    <Card className="flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <div className="relative aspect-square bg-muted flex items-center justify-center">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-4xl">📦</span>
        )}
        {outOfStock && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-t-xl">
            <Badge variant="destructive">Hết hàng</Badge>
          </div>
        )}
      </div>

      <CardContent className="flex-1 p-4 space-y-1">
        <h3 className="font-semibold text-sm leading-tight line-clamp-2">
          {product.name}
        </h3>
        {product.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {product.description}
          </p>
        )}
        <p className="text-lg font-bold text-primary pt-1">
          {formatPrice(product.price)}
        </p>
        <p className="text-xs text-muted-foreground">
          Còn {product.available} sản phẩm
        </p>
      </CardContent>

      <CardFooter className="p-4 pt-0">
        <Button
          className="w-full"
          disabled={outOfStock}
          onClick={() => router.push(`/checkout?productId=${product.id}`)}
        >
          {outOfStock ? "Hết hàng" : "Mua ngay"}
        </Button>
      </CardFooter>
    </Card>
  );
}
