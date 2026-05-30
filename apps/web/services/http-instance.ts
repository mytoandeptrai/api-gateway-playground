import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type CreateAxiosDefaults,
  type InternalAxiosRequestConfig,
} from "axios";
import qs from "qs";

import { BaseResponseType } from "@/types/base-type";
import { useSessionStore } from "@/store/use-session-store";

type TFailedRequests = {
  resolve: (value: AxiosResponse) => void;
  reject: (value: AxiosError) => void;
  config: AxiosRequestConfig;
  error: AxiosError;
};

type NonNullableObject<T> = {
  [K in keyof T]: T[K] extends object
    ? NonNullableObject<T[K]>
    : NonNullable<T[K]>;
};

type TRefreshToKenResponse = {
  token?: string;
  refreshToken?: string;
  tokenExpires?: number;
};

type ErrorResponseData = {
  retryAfter?: number;
  blockDuration?: number;
  error?: string;
};

type ErrorResponse = Omit<BaseResponseType<null>, "data"> & {
  data?: ErrorResponseData;
  error?: string;
};

class HttpInstance {
  private readonly instance: AxiosInstance;

  private failedRequests: TFailedRequests[] = [];

  private isTokenRefreshing = false;

  private baseURL = "";

  constructor(config?: CreateAxiosDefaults) {
    // Use Next.js API routes as proxy (backend URL hidden in server env)
    this.baseURL = "";

    this.instance = axios.create({
      ...config,
      baseURL: this.baseURL,
      headers: {
        "Content-Type": "application/json",
      },
      withCredentials: true,
      timeout: 10000,
      paramsSerializer: (params) => {
        const _params = this.cleanParams(params);
        return qs.stringify(_params, { arrayFormat: "repeat" });
      },
    });
    this.setupInterceptorsTo(this.instance);
  }

  private isEmpty<T>(value: T): boolean {
    return (
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim() === "") ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === "object" &&
        value !== null &&
        Object.keys(value).length === 0)
    );
  }

  private cleanParams<T extends Record<string, unknown>>(
    obj: T,
  ): NonNullableObject<T> {
    const result: Partial<NonNullableObject<T>> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (this.isEmpty(value)) {
        continue;
      }

      if (
        typeof value === "object" &&
        !Array.isArray(value) &&
        value !== null
      ) {
        const nested = this.cleanParams(value as Record<string, unknown>);
        if (Object.keys(nested).length > 0) {
          result[key as keyof T] = nested as NonNullableObject<T>[keyof T];
        }
      } else {
        result[key as keyof T] = value as NonNullableObject<T>[keyof T];
      }
    }

    return result as NonNullableObject<T>;
  }

  private readonly onRequest = async (
    config: InternalAxiosRequestConfig,
  ): Promise<InternalAxiosRequestConfig> => {
    const accessToken = useSessionStore.getState().token;

    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    const locale = document?.documentElement?.lang;
    if (locale) {
      config.headers["Accept-Language"] = locale;
    }

    return config;
  };

  private readonly onRequestError = (
    error: AxiosError,
  ): Promise<AxiosError> => {
    console.error(`[request error] [${JSON.stringify(error)}]`);

    return Promise.reject(error);
  };

  private readonly onResponse = (response: AxiosResponse) => {
    return response.data;
  };

  private readonly onResponseError = async (error: AxiosError) => {
    const originalRequest = error.config!;
    const data = error.response?.data as unknown as ErrorResponse;
    const statusCode = error.response?.status;
    const isTokenExpired = statusCode === 401 && data?.error === "unauthorized";

    if (!isTokenExpired) {
      return Promise.reject(data);
    }

    if (this.isTokenRefreshing) {
      return new Promise((resolve, reject) => {
        this.failedRequests.push({
          resolve,
          reject,
          config: originalRequest,
          error,
        });
      });
    }

    this.isTokenRefreshing = true;

    try {
      const refreshToken = useSessionStore.getState().refreshToken;
      const urlEndpoint = "/api/auth/refresh";

      const response = await axios.post(
        urlEndpoint,
        {
          refreshToken,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const result: TRefreshToKenResponse = response.data;
      useSessionStore.getState().setToken(result.token!);
      useSessionStore.getState().setRefreshToken(result.refreshToken!);

      this.failedRequests.forEach(({ resolve, reject, config }) => {
        this.instance(config)
          .then((resHttp) => resolve(resHttp))
          .catch((errorHttp) => reject(errorHttp));
      });
    } catch (error: unknown) {
      this.failedRequests.forEach(({ reject, error: errorFailedRequest }) =>
        reject(errorFailedRequest),
      );
      this.removeTokenCookie();
      return Promise.reject(error);
    } finally {
      this.failedRequests = [];
      this.isTokenRefreshing = false;
    }

    if (originalRequest) {
      return this.instance(originalRequest);
    }

    return Promise.reject(data);
  };

  private setupInterceptorsTo(axiosInstance: AxiosInstance): AxiosInstance {
    axiosInstance.interceptors.request.use(this.onRequest, this.onRequestError);
    axiosInstance.interceptors.response.use(
      this.onResponse,
      this.onResponseError,
    );

    return axiosInstance;
  }

  private removeTokenCookie() {
    useSessionStore.getState().reset();
  }

  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.instance.get(url, config);
  }

  public async post<T, D = unknown>(
    url: string,
    data: D,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return this.instance.post(url, data, config);
  }

  public async patch<T, D = unknown>(
    url: string,
    data: D,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return this.instance.patch(url, data, config);
  }

  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.instance.delete(url, config);
  }

  public async put<T, D = unknown>(
    url: string,
    data: D,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return this.instance.put(url, data, config);
  }
}

const httpInstance = new HttpInstance();

export default httpInstance;
