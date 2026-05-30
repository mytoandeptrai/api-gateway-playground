export type BaseResponseType<T> = {
  data?: T;
  code: number;
  message?: string;
};

export type PaginatedResponseType<T> = BaseResponseType<{
  data: T[];
  meta: {
    count: number;
    currentPage: number;
    totalPages: number;
  };
}>;
