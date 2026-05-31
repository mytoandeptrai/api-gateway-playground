export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED' | 'REFUNDED';

export type PaymentStatusInfo = {
  status: PaymentStatus;
  qrUrl: string | null;
  expiresAt: string | null;
};
