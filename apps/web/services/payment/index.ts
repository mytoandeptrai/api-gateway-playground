import { useQuery } from '@tanstack/react-query';
import { getPaymentStatusApi } from './api';

export const useGetPaymentStatusQuery = (orderId: string, enabled = true) =>
  useQuery({
    queryKey: ['payment', orderId],
    queryFn: () => getPaymentStatusApi(orderId),
    enabled: !!orderId && enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      if (status === 'COMPLETED' || status === 'EXPIRED' || status === 'FAILED') return false;
      return 5000;
    },
  });
