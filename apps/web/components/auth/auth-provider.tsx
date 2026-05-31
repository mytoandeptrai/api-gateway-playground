"use client";

import { LoadingScreen } from "@repo/ui/components/loading-screen";
import { useEffect, useState } from "react";
import { refreshApi } from "@/services/auth/api";
import { useSessionStore } from "@/store/use-session-store";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const { token, setToken, reset } = useSessionStore.getState();

    if (token) {
      setIsReady(true);
      return;
    }

    refreshApi()
      .then((res) => setToken(res.data.accessToken))
      .catch(() => reset())
      .finally(() => setIsReady(true));
  }, []);

  if (!isReady) return <LoadingScreen />;

  return <>{children}</>;
}
