export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAYMENT_RECEIVED"
  | "CONFIRMED"
  | "PREPARING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUND_REQUESTED"
  | "REFUNDED";

export type ShippingAddress = {
  fullName: string;
  phone: string;
  address: string;
  city: string;
};

export type Order = {
  id: string;
  userId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  status: OrderStatus;
  shippingAddress: ShippingAddress;
  paymentDeadline: string;
  trackingId: string | null;
  deliveredAt: string | null;
  cancelReason: string | null;
  sagaId: string | null;
  createdAt: string;
  updatedAt: string;
};
