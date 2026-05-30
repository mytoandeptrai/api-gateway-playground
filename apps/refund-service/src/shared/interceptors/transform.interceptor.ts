import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  success: boolean;
  statusCode: number;
  message?: string;
  data: T;
  timestamp: string;
}

/**
 * Transform Interceptor
 * Transforms all responses to a consistent format
 * @example
 * ```json
 * {
 *   "success": true,
 *   "statusCode": 200,
 *   "data": { ... },
 *   "timestamp": "2024-01-01T00:00:00.000Z"
 * }
 * ```
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const response = context.switchToHttp().getResponse();
    const statusCode = response.statusCode || HttpStatus.OK;

    return next.handle().pipe(
      map((data) => ({
        success: statusCode < 400,
        statusCode,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
