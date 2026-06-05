import { useQuery } from "@tanstack/react-query";
import { getSagaTraceApi } from "./api";

export const SAGA_KEYS = {
  trace: (orderId: string) => ["saga-trace", orderId] as const,
};

export const useGetSagaTraceQuery = (orderId: string) =>
  useQuery({
    queryKey: SAGA_KEYS.trace(orderId),
    queryFn: () => getSagaTraceApi(orderId),
    enabled: !!orderId,
    refetchInterval: (query) => {
      const sagas = query.state.data?.data?.sagas ?? [];
      const hasRunning = sagas.some(
        (s) => s.status === "RUNNING" || s.status === "COMPENSATING",
      );
      return hasRunning ? 3000 : false;
    },
  });
