import httpInstance from "../http-instance";
import type { SagaTraceResponse } from "./types.dto";
import type { BaseResponseType } from "@/types/base-type";

export const getSagaTraceApi = (orderId: string) =>
  httpInstance.get<BaseResponseType<SagaTraceResponse>>(
    `/api/saga/trace/${orderId}`,
  );
