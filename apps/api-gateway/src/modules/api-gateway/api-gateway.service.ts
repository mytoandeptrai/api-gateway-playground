import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { ApiRoute, LoadBalancingStrategy } from './entities/api-route.entity';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { CachingService } from 'src/shared/caching/caching.service';

/**
 * Gateway Request
 */
export interface GatewayRequest {
  path: string;
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body?: any;
  tenantId?: string;
  userId?: string;
}

/**
 * Gateway Response
 */
export interface GatewayResponse {
  status: number;
  headers: Record<string, string>;
  body: any;
  targetUrl: string;
  duration: number;
}

/**
 * Circuit Breaker State (exported for return types)
 */
export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

/**
 * API Gateway Service
 * Routes requests to appropriate backend services with load balancing
 */
@Injectable()
export class ApiGatewayService {
  private readonly logger = new Logger(ApiGatewayService.name);
  private circuitStates: Map<string, CircuitState> = new Map();
  private circuitFailures: Map<string, number> = new Map();
  private targetCounters: Map<string, number> = new Map();

  constructor(
    @InjectRepository(ApiRoute)
    private routeRepository: Repository<ApiRoute>,
    private httpService: HttpService,
    private cachingService: CachingService,
  ) {
    this.initializeCircuitBreakers();
  }

  /**
   * Route request through gateway
   */
  async routeRequest(request: GatewayRequest): Promise<GatewayResponse> {
    const startTime = Date.now();

    // Find matching route
    const route = await this.findMatchingRoute(request);

    if (!route) {
      throw new HttpException(
        'No route found for this request',
        HttpStatus.NOT_FOUND,
      );
    }

    if (!route.enabled) {
      throw new HttpException(
        'This route is disabled',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Check circuit breaker
    if (route.enableCircuitBreaker && this.isCircuitOpen(route.id)) {
      throw new HttpException(
        'Service temporarily unavailable (circuit breaker open)',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Select target
    const target = this.selectTarget(route);

    if (!target) {
      throw new HttpException(
        'No healthy targets available',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      // Transform request
      const transformedRequest = this.transformRequest(request, route);

      // Build target URL
      const targetUrl = this.buildTargetUrl(target.url, transformedRequest);

      // Check cache
      if (route.enableCaching && request.method === 'GET') {
        const cached = await this.getCachedResponse(targetUrl);
        if (cached) {
          this.logger.log(`Cache hit for ${targetUrl}`);
          return {
            ...cached,
            targetUrl,
            duration: Date.now() - startTime,
          };
        }
      }

      // Make request with retry
      const response = await this.makeRequestWithRetry(
        targetUrl,
        transformedRequest,
        route.retryAttempts,
        route.requestTimeout,
      );

      // Circuit breaker success
      this.recordCircuitSuccess(route.id);

      // Transform response
      const transformedResponse = this.transformResponse(response, route);

      // Cache response
      if (route.enableCaching && request.method === 'GET') {
        await this.cacheResponse(
          targetUrl,
          transformedResponse,
          route.cacheTTL,
        );
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Routed ${request.method} ${request.path} to ${targetUrl} in ${duration}ms`,
      );

      return {
        ...transformedResponse,
        targetUrl,
        duration,
      };
    } catch (error) {
      // Circuit breaker failure
      this.recordCircuitFailure(route.id, route);

      if (error instanceof HttpException) {
        throw error;
      }

      if (error instanceof AxiosError) {
        this.logger.error(
          `Gateway routing error for ${request.path}: ${error.message}`,
        );
        throw new HttpException(
          error.response?.data || error.message,
          error.response?.status || HttpStatus.BAD_GATEWAY,
        );
      }

      const message = error instanceof Error ? error.message : 'Gateway error';
      this.logger.error(
        `Gateway routing error for ${request.path}: ${message}`,
      );
      throw new HttpException(message, HttpStatus.BAD_GATEWAY);
    }
  }

  /**
   * Get route health status
   */
  async getRouteHealth(routeId: string): Promise<{
    route: ApiRoute;
    targets: Array<{ url: string; healthy: boolean; responseTime?: number }>;
    circuitState: CircuitState;
  }> {
    const route = await this.routeRepository.findOne({
      where: { id: routeId },
    });

    if (!route) {
      throw new HttpException('Route not found', HttpStatus.NOT_FOUND);
    }

    const targetHealth = await Promise.all(
      route.targets.map(
        async (target: { url: string; healthCheckUrl?: string }) => {
          const health = await this.checkTargetHealth(target);
          return {
            url: target.url,
            healthy: health.healthy,
            responseTime: health.responseTime,
          };
        },
      ),
    );

    return {
      route,
      targets: targetHealth,
      circuitState: this.circuitStates.get(routeId) || CircuitState.CLOSED,
    };
  }

  /**
   * Create a new route
   */
  async createRoute(dto: CreateRouteDto, tenantId?: string): Promise<ApiRoute> {
    const route = this.routeRepository.create({
      ...dto,
      tenantId: dto.tenantId ?? tenantId ?? undefined,
    });
    return this.routeRepository.save(route);
  }

  /**
   * Get a single route by ID (optional tenant scope)
   */
  async getRouteById(id: string, tenantId?: string): Promise<ApiRoute> {
    const route = await this.routeRepository.findOne({ where: { id } });

    if (!route) {
      throw new HttpException('Route not found', HttpStatus.NOT_FOUND);
    }

    if (tenantId && route.tenantId !== tenantId && !route.isGlobal) {
      throw new HttpException('Route not found', HttpStatus.NOT_FOUND);
    }

    return route;
  }

  /**
   * Update a route by ID (optional tenant scope)
   */
  async updateRoute(
    id: string,
    dto: UpdateRouteDto,
    tenantId?: string,
  ): Promise<ApiRoute> {
    const route = await this.getRouteById(id, tenantId);
    this.routeRepository.merge(route, dto);
    return this.routeRepository.save(route);
  }

  /**
   * Delete a route by ID (optional tenant scope)
   */
  async deleteRoute(id: string, tenantId?: string): Promise<void> {
    const route = await this.getRouteById(id, tenantId);
    await this.routeRepository.remove(route);
  }

  /**
   * Get all routes (optionally scoped by tenant)
   */
  async getRoutes(tenantId?: string): Promise<ApiRoute[]> {
    if (tenantId) {
      return this.routeRepository.find({
        where: [{ tenantId }, { isGlobal: true }],
        order: { priority: 'DESC' },
      });
    }

    return this.routeRepository.find({
      order: { priority: 'DESC' },
    });
  }

  // ========================================
  // Private Routing Methods
  // ========================================

  /**
   * Find matching route for request
   */
  private async findMatchingRoute(
    request: GatewayRequest,
  ): Promise<ApiRoute | null> {
    const routes = await this.getRoutes(request.tenantId);

    // Match by path and method
    for (const route of routes) {
      if (this.matchesRoute(request, route)) {
        return route;
      }
    }

    return null;
  }

  /**
   * Check if request matches route
   */
  private matchesRoute(request: GatewayRequest, route: ApiRoute): boolean {
    // Method match
    if (route.method !== '*' && route.method !== request.method) {
      return false;
    }

    // Path match (support wildcards)
    const routePath = route.path.replace(/\*/g, '.*');
    const regex = new RegExp(`^${routePath}$`);

    return regex.test(request.path);
  }

  /**
   * Select target based on load balancing strategy
   */
  private selectTarget(
    route: ApiRoute,
  ): { url: string; weight?: number } | null {
    const healthyTargets = route.targets.filter((target) =>
      this.isTargetHealthy(target.url),
    );

    if (healthyTargets.length === 0) {
      return null;
    }

    switch (route.loadBalancingStrategy) {
      case LoadBalancingStrategy.ROUND_ROBIN:
        return this.roundRobinSelect(route.id, healthyTargets);

      case LoadBalancingStrategy.WEIGHTED:
        return this.weightedSelect(healthyTargets);

      case LoadBalancingStrategy.RANDOM:
        return healthyTargets[
          Math.floor(Math.random() * healthyTargets.length)
        ];

      case LoadBalancingStrategy.LEAST_CONNECTIONS:
        // Simplified: just use round robin
        return this.roundRobinSelect(route.id, healthyTargets);

      default:
        return healthyTargets[0];
    }
  }

  /**
   * Round-robin load balancing
   */
  private roundRobinSelect(
    routeId: string,
    targets: Array<{ url: string }>,
  ): { url: string } {
    const counter = this.targetCounters.get(routeId) || 0;
    const index = counter % targets.length;

    this.targetCounters.set(routeId, counter + 1);

    return targets[index];
  }

  /**
   * Weighted load balancing
   */
  private weightedSelect(targets: Array<{ url: string; weight?: number }>): {
    url: string;
    weight?: number;
  } {
    const totalWeight = targets.reduce((sum, t) => sum + (t.weight || 1), 0);
    let random = Math.random() * totalWeight;

    for (const target of targets) {
      random -= target.weight || 1;
      if (random <= 0) {
        return target;
      }
    }

    return targets[0];
  }

  /**
   * Transform request before forwarding to target service.
   *
   * Path transform order: stripPrefix → addPrefix → rewritePath (overrides all).
   *
   * Example flow (gateway → auth-service):
   *   Original path:  /api/v1/gateway/auth/login
   *   stripPrefix:    "/api/v1/gateway"  → /auth/login
   *   addPrefix:      "/api/v1"          → /api/v1/auth/login
   *   Target URL:     http://localhost:3003 + /api/v1/auth/login
   *   Final:          http://localhost:3003/api/v1/auth/login
   */
  private transformRequest(
    request: GatewayRequest,
    route: ApiRoute,
  ): GatewayRequest {
    const transformed = { ...request };

    if (route.requestTransform) {
      if (route.requestTransform.addHeaders) {
        transformed.headers = {
          ...transformed.headers,
          ...route.requestTransform.addHeaders,
        };
      }

      if (route.requestTransform.removeHeaders) {
        route.requestTransform.removeHeaders.forEach((header) => {
          delete transformed.headers[header];
        });
      }

      if (route.requestTransform.addQueryParams) {
        transformed.query = {
          ...transformed.query,
          ...route.requestTransform.addQueryParams,
        };
      }

      // 1. Strip prefix (e.g., "/api/v1/gateway/auth/login" → "/auth/login")
      if (route.requestTransform.stripPrefix) {
        const prefix = route.requestTransform.stripPrefix;
        if (transformed.path.startsWith(prefix)) {
          transformed.path = transformed.path.slice(prefix.length) || '/';
        }
      }

      // 2. Add prefix (e.g., "/auth/login" → "/api/v1/auth/login")
      if (route.requestTransform.addPrefix) {
        transformed.path = route.requestTransform.addPrefix + transformed.path;
      }

      // 3. Rewrite path (replaces entire path, overrides strip/add above)
      if (route.requestTransform.rewritePath) {
        transformed.path = route.requestTransform.rewritePath;
      }
    }

    return transformed;
  }

  /**
   * Transform response
   */
  private transformResponse(
    response: any,
    route: ApiRoute,
  ): { status: number; headers: Record<string, string>; body: any } {
    const transformed = {
      status: response.status,
      headers: response.headers || {},
      body: response.data,
    };

    if (route.responseTransform) {
      // Add headers
      if (route.responseTransform.addHeaders) {
        transformed.headers = {
          ...transformed.headers,
          ...route.responseTransform.addHeaders,
        };
      }

      // Remove headers
      if (route.responseTransform.removeHeaders) {
        route.responseTransform.removeHeaders.forEach((header) => {
          delete transformed.headers[header];
        });
      }

      // Map status codes
      if (route.responseTransform.statusCodeMapping) {
        const mappedStatus =
          route.responseTransform.statusCodeMapping[transformed.status];
        if (mappedStatus) {
          transformed.status = mappedStatus;
        }
      }
    }

    return transformed;
  }

  /**
   * Build target URL with query params
   */
  private buildTargetUrl(baseUrl: string, request: GatewayRequest): string {
    const url = new URL(baseUrl);

    // Add path
    url.pathname = request.path;

    // Add query params
    Object.entries(request.query || {}).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    return url.toString();
  }

  /**
   * Make HTTP request with retry
   */
  private async makeRequestWithRetry(
    url: string,
    request: GatewayRequest,
    maxRetries: number,
    timeout: number,
  ): Promise<any> {
    let lastError: AxiosError | Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await firstValueFrom(
          this.httpService.request({
            url,
            method: request.method,
            headers: request.headers,
            data: request.body,
            timeout,
          }),
        );

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  // ========================================
  // Circuit Breaker Methods
  // ========================================

  /**
   * Initialize circuit breakers
   */
  private initializeCircuitBreakers(): void {
    // Load circuit states from Redis on startup
    this.logger.log('Circuit breakers initialized');
  }

  /**
   * Check if circuit is open
   */
  private isCircuitOpen(routeId: string): boolean {
    return this.circuitStates.get(routeId) === CircuitState.OPEN;
  }

  /**
   * Record circuit success
   */
  private recordCircuitSuccess(routeId: string): void {
    this.circuitFailures.set(routeId, 0);

    if (this.circuitStates.get(routeId) === CircuitState.HALF_OPEN) {
      this.circuitStates.set(routeId, CircuitState.CLOSED);
      this.logger.log(`Circuit breaker CLOSED for route ${routeId}`);
    }
  }

  /**
   * Record circuit failure
   */
  private recordCircuitFailure(routeId: string, route: ApiRoute): void {
    if (!route.enableCircuitBreaker) return;

    const failures = (this.circuitFailures.get(routeId) || 0) + 1;
    this.circuitFailures.set(routeId, failures);

    if (failures >= route.circuitBreakerThreshold) {
      this.circuitStates.set(routeId, CircuitState.OPEN);
      this.logger.warn(`Circuit breaker OPENED for route ${routeId}`);

      // Schedule half-open transition
      setTimeout(() => {
        this.circuitStates.set(routeId, CircuitState.HALF_OPEN);
        this.logger.log(`Circuit breaker HALF-OPEN for route ${routeId}`);
      }, route.circuitBreakerTimeout * 1000);
    }
  }

  // ========================================
  // Health Check Methods
  // ========================================

  /**
   * Check if target is healthy
   */
  private isTargetHealthy(_url: string): boolean {
    // In production: check Redis for health status
    // For now, assume all targets are healthy
    return true;
  }

  /**
   * Check target health
   */
  private async checkTargetHealth(target: {
    url: string;
    healthCheckUrl?: string;
  }): Promise<{ healthy: boolean; responseTime?: number }> {
    const checkUrl = target.healthCheckUrl || `${target.url}/health`;
    const startTime = Date.now();

    try {
      await firstValueFrom(
        this.httpService.get(checkUrl, {
          timeout: 5000,
        }),
      );

      return {
        healthy: true,
        responseTime: Date.now() - startTime,
      };
    } catch {
      return {
        healthy: false,
      };
    }
  }

  // ========================================
  // Cache Methods
  // ========================================

  /**
   * Get cached response
   */
  private async getCachedResponse(
    url: string,
  ): Promise<GatewayResponse | null> {
    try {
      const cached: GatewayResponse | null = await this.cachingService.get(
        `gateway:cache:${url}`,
      );

      return cached;
    } catch (error) {
      this.logger.error(
        'Cache get error:',
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }

  /**
   * Cache response
   */
  private async cacheResponse(
    url: string,
    response: any,
    ttl: number = 60,
  ): Promise<void> {
    try {
      await this.cachingService.set(`gateway:cache:${url}`, response, { ttl });
    } catch (error) {
      this.logger.error(
        'Cache set error:',
        error instanceof Error ? error.message : error,
      );
    }
  }
}
