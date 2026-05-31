import httpInstance from "../http-instance";
import type { BaseResponseType } from "@/types/base-type";
import type { PaymentStatusInfo } from "./types.dto";

export const getPaymentStatusApi = (orderId: string) =>
  httpInstance.get<BaseResponseType<PaymentStatusInfo>>(
    `/api/payment/${orderId}/status`,
  );

export const verifyPaymentReturnApi = (params: Record<string, string>) =>
  httpInstance.get<{ data: { RspCode: string; Message: string } }>(
    `/api/payment/verify-return`,
    { params },
  );
