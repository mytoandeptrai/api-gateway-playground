import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  IsBoolean,
  IsNumber,
  Min,
  MaxLength,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  RouteTargetType,
  LoadBalancingStrategy,
} from '../entities/api-route.entity';
import { RouteTargetDto } from './route-target.dto';

/**
 * Request transform config (add/remove headers, query, rewrite path)
 */
export class RequestTransformDto {
  @ApiProperty({ example: { 'X-Custom': 'value' }, required: false })
  @IsOptional()
  @IsObject()
  addHeaders?: Record<string, string>;

  @ApiProperty({ example: ['X-Internal'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  removeHeaders?: string[];

  @ApiProperty({ example: { apiKey: 'secret' }, required: false })
  @IsOptional()
  @IsObject()
  addQueryParams?: Record<string, string>;

  @ApiProperty({ example: '/v2/keywords', required: false })
  @IsOptional()
  @IsString()
  rewritePath?: string;

  @ApiProperty({
    example: '/gateway',
    description: 'Prefix to strip from request path before forwarding',
    required: false,
  })
  @IsOptional()
  @IsString()
  stripPrefix?: string;

  @ApiProperty({
    example: '/api/v1',
    description: 'Prefix to add to request path before forwarding',
    required: false,
  })
  @IsOptional()
  @IsString()
  addPrefix?: string;
}

/**
 * Response transform config (headers, status code mapping)
 */
export class ResponseTransformDto {
  @ApiProperty({ example: { 'X-From-Gateway': 'true' }, required: false })
  @IsOptional()
  @IsObject()
  addHeaders?: Record<string, string>;

  @ApiProperty({ example: ['X-Internal'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  removeHeaders?: string[];

  @ApiProperty({ example: { 502: 503 }, required: false })
  @IsOptional()
  @IsObject()
  statusCodeMapping?: Record<number, number>;
}

/**
 * DTO for creating an API route
 */
export class CreateRouteDto {
  @ApiProperty({
    example: '/keywords/*',
    description: 'Path pattern (* = wildcard)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  path: string;

  @ApiProperty({ example: 'GET', description: 'HTTP method or * for all' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  method: string;

  @ApiProperty({ example: 'Keywords Service', description: 'Route name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'Proxies to keyword microservice', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: RouteTargetType })
  @IsEnum(RouteTargetType)
  targetType: RouteTargetType;

  @ApiProperty({
    type: [RouteTargetDto],
    example: [{ url: 'http://localhost:3001', weight: 1 }],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteTargetDto)
  targets: RouteTargetDto[];

  @ApiProperty({
    enum: LoadBalancingStrategy,
    default: LoadBalancingStrategy.ROUND_ROBIN,
  })
  @IsOptional()
  @IsEnum(LoadBalancingStrategy)
  loadBalancingStrategy?: LoadBalancingStrategy;

  @ApiProperty({
    description: 'Tenant ID (null = all tenants)',
    required: false,
  })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ default: false })
  @IsOptional()
  @IsBoolean()
  isGlobal?: boolean;

  @ApiProperty({ type: RequestTransformDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => RequestTransformDto)
  requestTransform?: RequestTransformDto;

  @ApiProperty({ type: ResponseTransformDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ResponseTransformDto)
  responseTransform?: ResponseTransformDto;

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  enableCircuitBreaker?: boolean;

  @ApiProperty({ default: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  circuitBreakerThreshold?: number;

  @ApiProperty({ default: 60 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  circuitBreakerTimeout?: number;

  @ApiProperty({ default: 30000 })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  requestTimeout?: number;

  @ApiProperty({ default: 3 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  retryAttempts?: number;

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  requiresAuth?: boolean;

  @ApiProperty({ example: ['ADMIN', 'MEMBER'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedRoles?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  rateLimitRuleId?: string;

  @ApiProperty({ default: false })
  @IsOptional()
  @IsBoolean()
  enableCaching?: boolean;

  @ApiProperty({ description: 'Cache TTL in seconds', required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  cacheTTL?: number;

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ default: 0, description: 'Higher = matched first' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priority?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
