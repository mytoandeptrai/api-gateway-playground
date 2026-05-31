import httpInstance from "../http-instance";
import type { CreateOrderRequest } from "./request.dto";
import type {
  CreateOrderResponse,
  GetOrdersResponse,
  GetOrderResponse,
} from "./response.dto";

export const createOrderApi = (body: CreateOrderRequest) =>
  httpInstance.post<CreateOrderResponse>("/api/orders", body);

export const getOrdersApi = () =>
  httpInstance.get<GetOrdersResponse>("/api/orders");

export const getOrderByIdApi = (id: string) =>
  httpInstance.get<GetOrderResponse>(`/api/orders/${id}`);
