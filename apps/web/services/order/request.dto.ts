import type { ShippingAddress } from "./types.dto";

export type CreateOrderRequest = {
  productId: string;
  quantity: number;
  shippingAddress: ShippingAddress;
};
