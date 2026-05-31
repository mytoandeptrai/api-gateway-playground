import { useMutation } from "@tanstack/react-query";
import { loginApi, logoutApi } from "./api";
import { LoginRequest } from "./request.dto";

export const useLoginMutation = () =>
  useMutation({
    mutationFn: (body: LoginRequest) => loginApi(body),
  });

export const useLogoutMutation = () => {
  return useMutation({
    mutationFn: () => logoutApi(),
  });
};
