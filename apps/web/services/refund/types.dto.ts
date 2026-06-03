export type RefundStatus =
  | "REFUND_PENDING"
  | "REFUND_APPROVED"
  | "REFUND_REJECTED"
  | "REFUNDED";

export type RefundRequest = {
  id: string;
  orderId: string;
  userId: string;
  reason: string;
  fileUrls: string[];
  status: RefundStatus;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
};
