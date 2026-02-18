import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitingService } from '../rate-limiting.service';

/**
 * Rate Limit Guard
 * Applies rate limiting to routes
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rateLimitingService: RateLimitingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if rate limiting is explicitly disabled for this route
    const skipRateLimit = this.reflector.getAllAndOverride<boolean>(
      'skipRateLimit',
      [context.getHandler(), context.getClass()],
    );

    if (skipRateLimit) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Build context
    const rateLimitContext = {
      tenantId: request.user?.tenantId,
      userId: request.user?.id,
      ipAddress: this.getIpAddress(request),
      endpoint: request.route?.path || request.url,
      method: request.method,
      userAgent: request.headers['user-agent'],
      headers: request.headers,
    };

    // Check rate limit
    const result =
      await this.rateLimitingService.checkRateLimit(rateLimitContext);

    // Set rate limit headers
    response.setHeader('X-RateLimit-Limit', result.limit);
    response.setHeader('X-RateLimit-Remaining', result.remaining);
    response.setHeader(
      'X-RateLimit-Reset',
      Math.floor(result.resetAt.getTime() / 1000),
    );

    if (!result.allowed) {
      if (result.retryAfter) {
        response.setHeader('Retry-After', result.retryAfter);
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message:
            result.rule?.customMessage ||
            'Too many requests. Please try again later.',
          error: 'Too Many Requests',
          limit: result.limit,
          remaining: result.remaining,
          resetAt: result.resetAt,
          retryAfter: result.retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Increment counter (request is allowed)
    await this.rateLimitingService.incrementCounter(rateLimitContext);

    return true;
  }

  /**
   * Extract IP address from request
   */
  private getIpAddress(request: any): string {
    return (
      request.headers['x-forwarded-for']?.split(',')[0] ||
      request.headers['x-real-ip'] ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      request.ip ||
      'unknown'
    );
  }
}
