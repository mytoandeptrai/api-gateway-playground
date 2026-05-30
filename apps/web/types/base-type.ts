// Matches TransformInterceptor response format from all NestJS services
export type BaseResponseType<T> = {
  success: boolean;
  statusCode: number;
  data: T;
  timestamp: string;
  message?: string;
};

export type PaginatedResponseType<T> = BaseResponseType<{
  data: T[];
  total: number;
}>;
