import { useQuery } from '@tanstack/react-query';
import { getProductsApi, getProductByIdApi } from './api';

export const useGetProductsQuery = () =>
  useQuery({
    queryKey: ['products'],
    queryFn: () => getProductsApi(),
  });

export const useGetProductByIdQuery = (id: string) =>
  useQuery({
    queryKey: ['products', id],
    queryFn: () => getProductByIdApi(id),
    enabled: !!id,
  });
