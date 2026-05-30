import httpInstance from '../http-instance';
import type { LoginRequest } from './request.dto';
import type { LoginResponse, RefreshResponse } from './response.dto';

export const loginApi = (body: LoginRequest) =>
  httpInstance.post<LoginResponse>('/api/auth/login', body);

// No body needed — browser sends httpOnly cookie automatically
export const refreshApi = () =>
  httpInstance.post<RefreshResponse>('/api/auth/refresh', {});

export const logoutApi = () =>
  httpInstance.post<void>('/api/auth/logout', {});
