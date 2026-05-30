export type GetAuthNonceResponse = { nonce: string };

export type VerifyAuthResponse = {
  token: string;
  refreshToken: string;
};

export type GetMeResponse = {
  id: string;
  email: string;
  role: string;
};