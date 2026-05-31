"use client";

import { useEffect } from "react";
import { io } from "socket.io-client";
import { useSessionStore } from "@/store/use-session-store";
import { queryClient } from "@/app/providers";
import { ORDER_KEYS } from "@/services/order";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:3010";

export function useOrderSocket(orderId?: string) {
  const token = useSessionStore((s) => s.token);

  useEffect(() => {
    if (!token) return;

    // Decode userId from JWT (sub claim) without verification
    let userId: string | undefined;
    try {
      const part = token.split(".")[1];
      if (!part) return;
      const payload = JSON.parse(atob(part));
      userId = String(payload.sub);
    } catch {
      return;
    }

    const socket = io(`${WS_URL}/notifications`, {
      query: { userId },
      transports: ["websocket"],
    });

    socket.on("order.status_updated", (data: { orderId: string }) => {
      queryClient.invalidateQueries({ queryKey: ORDER_KEYS.all });
      if (orderId && data.orderId === orderId) {
        queryClient.invalidateQueries({ queryKey: ORDER_KEYS.detail(orderId) });
        queryClient.invalidateQueries({ queryKey: ["payment", orderId] });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [token, orderId]);
}
