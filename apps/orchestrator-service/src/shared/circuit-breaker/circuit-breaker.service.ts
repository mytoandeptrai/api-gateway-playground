import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import CircuitBreaker from 'opossum';

// Per-target circuit breaker registry
const registry = new Map<string, CircuitBreaker>();

const CB_OPTIONS: CircuitBreaker.Options = {
  errorThresholdPercentage: 50, // open after 50% failures
  resetTimeout: 30_000, // half-open after 30s
  timeout: 10_000, // single call timeout
  volumeThreshold: 3, // min calls before evaluating %
};

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);

  constructor(private readonly httpService: HttpService) {}

  async get<T>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.call(url, () =>
      firstValueFrom(this.httpService.get<T>(url, config)),
    );
  }

  async post<T>(
    url: string,
    data: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.call(url, () =>
      firstValueFrom(this.httpService.post<T>(url, data, config)),
    );
  }

  async patch<T>(
    url: string,
    data: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.call(url, () =>
      firstValueFrom(this.httpService.patch<T>(url, data, config)),
    );
  }

  private getBreaker(key: string): CircuitBreaker {
    if (!registry.has(key)) {
      const breaker = new CircuitBreaker(
        async (fn: () => Promise<unknown>) => fn(),
        CB_OPTIONS,
      );

      breaker.on('open', () =>
        this.logger.warn(`[CircuitBreaker] OPEN — ${key}`),
      );
      breaker.on('halfOpen', () =>
        this.logger.log(`[CircuitBreaker] HALF-OPEN — ${key}`),
      );
      breaker.on('close', () =>
        this.logger.log(`[CircuitBreaker] CLOSED — ${key}`),
      );

      registry.set(key, breaker);
    }
    return registry.get(key)!;
  }

  private async call<T>(url: string, fn: () => Promise<T>): Promise<T> {
    const key = this.extractHost(url);
    const breaker = this.getBreaker(key);

    try {
      return (await breaker.fire(fn)) as T;
    } catch (err) {
      if (breaker.opened) {
        throw new ServiceUnavailableException(
          `Service ${key} is currently unavailable (circuit open)`,
        );
      }
      throw err;
    }
  }

  private extractHost(url: string): string {
    try {
      const { hostname, port } = new URL(url);
      return port ? `${hostname}:${port}` : hostname;
    } catch {
      return url;
    }
  }
}
