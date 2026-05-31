import type { BaseResponseType } from "@/types/base-type";
import type { AuthUser } from "./types.dto";

export type LoginResponse = BaseResponseType<{
  accessToken: string;
  user: AuthUser;
}>;

export type RefreshResponse = BaseResponseType<{
  accessToken: string;
}>;
