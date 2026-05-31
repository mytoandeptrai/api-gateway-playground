"use client";

import { cn } from "@repo/ui/lib/utils";

interface LoadingScreenProps {
  className?: string;
}

export function LoadingScreen({ className }: LoadingScreenProps) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center bg-background gap-4",
        className,
      )}
    >
      <div className="relative">
        <div className="h-12 w-12 rounded-full border-4 border-muted" />
        <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
      <p className="text-sm text-muted-foreground animate-pulse">NextMart</p>
    </div>
  );
}
