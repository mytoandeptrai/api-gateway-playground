import httpInstance from "../http-instance";
import type { BaseResponseType } from "@/types/base-type";
import type { RefundRequest } from "./types.dto";

export const createRefundApi = (formData: FormData) =>
  httpInstance.post<BaseResponseType<{ refundId: string; status: string }>>(
    "/api/refund",
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );

export const getRefundByOrderIdApi = (orderId: string) =>
  httpInstance.get<BaseResponseType<RefundRequest | null>>(
    `/api/refund/${orderId}`,
  );
