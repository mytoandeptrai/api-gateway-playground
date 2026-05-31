"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShoppingBag, Package, LogOut } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { useSessionStore } from "@/store/use-session-store";

const NAV_LINKS = [
  { href: "/products", label: "Sản phẩm", icon: ShoppingBag },
  { href: "/orders", label: "Đơn hàng", icon: Package },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const token = useSessionStore((s) => s.token);
  const reset = useSessionStore((s) => s.reset);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    reset();
    router.replace("/login");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/products" className="font-semibold text-sm">
          NextMart
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <Button
                variant={pathname.startsWith(href) ? "secondary" : "ghost"}
                size="sm"
                className="gap-1.5"
                disabled={!token}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Button>
            </Link>
          ))}

          {token && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
