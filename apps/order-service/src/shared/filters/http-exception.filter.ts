import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let errorCode = 'INTERNAL_SERVER_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        const res = exceptionResponse as Record<string, unknown>;
        message = (res.message as string | string[]) ?? message;
        errorCode = (res.errorCode as string) ?? (res.error as string) ?? exception.name;
      } else {
        message = exceptionResponse as string;
        errorCode = exception.name;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      errorCode = exception.name;
    }

    const correlationId =
      (request.headers['x-correlation-id'] as string) ?? randomUUID();
    const sagaId = request.headers['x-saga-id'] as string | undefined;

    this.logger.error(
      `[${correlationId}] ${request.method} ${request.url} → ${status} ${errorCode}: ${JSON.stringify(message)}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    const body: Record<string, unknown> = {
      statusCode: status,
      message: Array.isArray(message) ? message.join(', ') : message,
      errorCode,
      correlationId,
      timestamp: new Date().toISOString(),
    };
    if (sagaId) body.sagaId = sagaId;

    response.status(status).json(body);
  }
}
