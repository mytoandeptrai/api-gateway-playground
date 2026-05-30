import { useMutation, useQuery } from "@tanstack/react-query";
import { getAuthNonce, getMe, verifyAuth } from "./api";
import type {
  GetAuthNonceParams,
  GetMeParams,
  VerifyAuthRequestBody,
} from "./request.dto";
import { GetMeResponse } from "./response.dto";

export const useGetAuthNonceMutation = () => {
  return useMutation({
    mutationFn: (params: GetAuthNonceParams) => getAuthNonce(params),
  });
};

export const useVerifyAuthMutation = () => {
  return useMutation({
    mutationFn: (body: VerifyAuthRequestBody) => verifyAuth(body),
  });
};

export const useGetMeQuery = (
  params: GetMeParams,
  queryParams?: Omit<
    Parameters<typeof useQuery<GetMeResponse>>[0],
    "queryKey" | "queryFn"
  >,
) => {
  return useQuery<GetMeResponse>({
    queryKey: ["me", params],
    queryFn: ({ signal }) => getMe(params, signal),
    ...queryParams,
  });
};
