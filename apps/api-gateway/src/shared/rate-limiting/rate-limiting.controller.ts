import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipRateLimit } from './decorators/rate-limit.decorator';
import { CreateRateLimitRuleDto } from './dto/create-rate-limit-rule.dto';
import { RateLimitingService } from './rate-limiting.service';

/**
 * Rate Limiting Controller
 * Manage rate limit rules (admin only)
 */
@ApiTags('rate-limiting')
@Controller('rate-limiting')
@ApiBearerAuth()
@SkipRateLimit() // Admin endpoints don't have rate limits
export class RateLimitingController {
  constructor(private readonly rateLimitingService: RateLimitingService) {}

  /**
   * Create rate limit rule
   */
  @Post('rules')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create rate limit rule' })
  @ApiResponse({ status: 201, description: 'Rule created' })
  async createRule(@Body() dto: CreateRateLimitRuleDto) {
    return this.rateLimitingService.createRule(dto);
  }

  /**
   * Get violations
   */
  @Get('violations')
  @ApiOperation({ summary: 'Get rate limit violations' })
  @ApiResponse({ status: 200, description: 'Violations retrieved' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'endpoint', required: false })
  @ApiQuery({ name: 'ipAddress', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getViolations(
    @Query('tenantId') tenantId?: string,
    @Query('userId') userId?: string,
    @Query('endpoint') endpoint?: string,
    @Query('ipAddress') ipAddress?: string,
    @Query('limit') limit?: number,
  ) {
    return this.rateLimitingService.getViolations({
      tenantId,
      userId,
      endpoint,
      ipAddress,
      limit: limit || 100,
    });
  }

  /**
   * Get rate limit status for IP
   */
  @Get('status/:ipAddress')
  @ApiOperation({ summary: 'Get rate limit status for IP' })
  @ApiResponse({ status: 200, description: 'Status retrieved' })
  async getStatus(
    @Param('ipAddress') ipAddress: string,
    @Query('endpoint') endpoint: string = '/',
  ) {
    return this.rateLimitingService.getRateLimitStatus({
      ipAddress,
      endpoint,
      method: 'GET',
    });
  }

  /**
   * Reset rate limit
   */
  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset rate limit for context' })
  @ApiResponse({ status: 200, description: 'Rate limit reset' })
  async resetRateLimit(
    @Body()
    body: {
      tenantId?: string;
      userId?: string;
      ipAddress?: string;
      endpoint?: string;
    },
  ) {
    await this.rateLimitingService.resetRateLimit(body);
    return { message: 'Rate limit reset successfully' };
  }
}
