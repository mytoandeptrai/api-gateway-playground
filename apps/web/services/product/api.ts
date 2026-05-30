import httpInstance from '../http-instance';
import type { GetProductsResponse, GetProductByIdResponse } from './response.dto';

export const getProductsApi = () =>
  httpInstance.get<GetProductsResponse>('/api/products');

export const getProductByIdApi = (id: string) =>
  httpInstance.get<GetProductByIdResponse>(`/api/products/${id}`);
