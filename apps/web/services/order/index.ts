import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createOrderApi, getOrdersApi, getOrderByIdApi } from "./api";
import type { CreateOrderRequest } from "./request.dto";

export const ORDER_KEYS = {
  all: ["orders"] as const,
  detail: (id: string) => ["orders", id] as const,
};

export const useCreateOrderMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateOrderRequest) => createOrderApi(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ORDER_KEYS.all }),
  });
};

export const useGetOrdersQuery = () =>
  useQuery({
    queryKey: ORDER_KEYS.all,
    queryFn: () => getOrdersApi(),
  });

export const useGetOrderQuery = (id: string) =>
  useQuery({
    queryKey: ORDER_KEYS.detail(id),
    queryFn: () => getOrderByIdApi(id),
    enabled: !!id,
  });
