import type {
  GetAuthNonceParams,
  GetMeParams,
  VerifyAuthRequestBody,
} from "./request.dto";
import type {
  GetAuthNonceResponse,
  GetMeResponse,
  VerifyAuthResponse,
} from "./response.dto";
import httpInstance from "../http-instance";

export const getAuthNonce = (params: GetAuthNonceParams) => {
  return httpInstance
    .get<GetAuthNonceResponse>("/api/auth/nonce", {
      params,
    })
    .then((res) => res);
};

export const verifyAuth = (
  body: VerifyAuthRequestBody,
  signal?: AbortSignal,
) => {
  return httpInstance
    .post<VerifyAuthResponse>("/api/auth/verify", body, {
      signal,
    })
    .then((res) => res);
};

export const getMe = (params: GetMeParams, signal?: AbortSignal) => {
  return httpInstance
    .get<GetMeResponse>("/api/auth/me", {
      params,
      signal,
    })
    .then((res) => res);
};
