import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsUrl,
} from 'class-validator';

/**
 * Single target for an API route (URL + optional weight, priority, health check)
 */
export class RouteTargetDto {
  @ApiProperty({
    example: 'http://localhost:3001',
    description: 'Target base URL',
  })
  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_tld: false })
  url: string;

  @ApiProperty({
    example: 1,
    description: 'Weight for weighted load balancing',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  weight?: number;

  @ApiProperty({
    example: 1,
    description: 'Priority when multiple targets',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priority?: number;

  @ApiProperty({
    example: 'http://localhost:3001/health',
    description: 'Custom health check URL (default: ${url}/health)',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false })
  healthCheckUrl?: string;
}
