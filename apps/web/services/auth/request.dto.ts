export type GetAuthNonceParams = {
  address?: string;
};

export type VerifyAuthRequestBody = {
  address: string;
  nonce: string;
  signature: string;
};

export type GetMeParams = {
  example?: string;
};