"use client";

import { useState, type ReactNode } from "react";
import { ThemeProvider } from "@repo/ui/providers/theme-provider";
import { Toaster } from "@repo/ui/components/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 0,
      staleTime: 1000,
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  const [_queryClient] = useState(() => queryClient);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      enableColorScheme
    >
      <QueryClientProvider client={_queryClient}>
        {children}
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
      <Toaster richColors />
    </ThemeProvider>
  );
}
