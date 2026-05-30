import type { BaseResponseType } from '@/types/base-type';
import type { Product } from './types.dto';

export type GetProductsResponse = BaseResponseType<{
  data: Product[];
  total: number;
}>;

export type GetProductByIdResponse = BaseResponseType<Product>;
