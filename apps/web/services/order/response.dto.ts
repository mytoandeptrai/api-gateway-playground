import type { BaseResponseType } from '@/types/base-type';
import type { Order } from './types.dto';

export type CreateOrderResponse = BaseResponseType<{
  orderId: string;
  totalAmount: number;
  paymentDeadline: string;
}>;

export type GetOrdersResponse = BaseResponseType<Order[]>;

export type GetOrderResponse = BaseResponseType<Order>;
