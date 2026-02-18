import {
  Controller,
  All,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiGatewayService } from './api-gateway.service';
import {
  ApiExcludeController,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { ApiRoute } from './entities/api-route.entity';
import { RateLimitGuard } from '../../shared/rate-limiting/guards/rate-limit.guard';

/**
 * API Gateway Controller
 * CRUD for routes + proxy catch-all
 */
@Controller('gateway')
@ApiTags('Gateway')
export class ApiGatewayController {
  constructor(private readonly gatewayService: ApiGatewayService) {}

  private getTenantId(req: Request): string | undefined {
    return (req as any).user?.tenantId;
  }

  // ========== CRUD (declare before @All('*') so they match first) ==========

  @Get('routes')
  @ApiOperation({ summary: 'List all routes' })
  @ApiResponse({ status: 200, description: 'List of routes' })
  async listRoutes(@Req() req: Request): Promise<ApiRoute[]> {
    return this.gatewayService.getRoutes(this.getTenantId(req));
  }

  @Get('routes/:id')
  @ApiOperation({ summary: 'Get route by ID' })
  @ApiResponse({ status: 200, description: 'Route details' })
  @ApiResponse({ status: 404, description: 'Route not found' })
  async getRoute(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<ApiRoute> {
    return this.gatewayService.getRouteById(id, this.getTenantId(req));
  }

  @Get('routes/:id/health')
  @ApiOperation({ summary: 'Get route health (targets + circuit state)' })
  @ApiResponse({ status: 200, description: 'Route health' })
  @ApiResponse({ status: 404, description: 'Route not found' })
  async getRouteHealth(@Req() req: Request, @Param('id') id: string) {
    await this.gatewayService.getRouteById(id, this.getTenantId(req));
    return this.gatewayService.getRouteHealth(id);
  }

  @Post('routes')
  @ApiOperation({ summary: 'Create a route' })
  @ApiResponse({ status: 201, description: 'Route created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async createRoute(
    @Req() req: Request,
    @Body() dto: CreateRouteDto,
  ): Promise<ApiRoute> {
    return this.gatewayService.createRoute(dto, this.getTenantId(req));
  }

  @Patch('routes/:id')
  @ApiOperation({ summary: 'Update a route' })
  @ApiResponse({ status: 200, description: 'Route updated' })
  @ApiResponse({ status: 404, description: 'Route not found' })
  async updateRoute(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateRouteDto,
  ): Promise<ApiRoute> {
    return this.gatewayService.updateRoute(id, dto, this.getTenantId(req));
  }

  @Delete('routes/:id')
  @ApiOperation({ summary: 'Delete a route' })
  @ApiResponse({ status: 200, description: 'Route deleted' })
  @ApiResponse({ status: 404, description: 'Route not found' })
  async deleteRoute(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<void> {
    await this.gatewayService.deleteRoute(id, this.getTenantId(req));
  }

  /**
   * Handle all other requests through gateway (proxy)
   */
  @All('*path')
  @UseGuards(RateLimitGuard)
  async handleRequest(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Strip hop-by-hop and problematic headers that break proxying.
    // content-length from the original request won't match the re-serialized
    // body, causing the upstream to abort with "request aborted".
    const HOP_BY_HOP_HEADERS = new Set([
      'content-length',
      'transfer-encoding',
      'connection',
      'keep-alive',
      'host',
      'upgrade',
      'expect',
      'te',
    ]);

    const forwardHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (
        !HOP_BY_HOP_HEADERS.has(key.toLowerCase()) &&
        typeof value === 'string'
      ) {
        forwardHeaders[key] = value;
      }
    }

    const gatewayRequest = {
      path: req.path,
      method: req.method,
      headers: forwardHeaders,
      query: req.query as Record<string, string>,
      body: req.body,
      tenantId: (req as any).user?.tenantId,
      userId: (req as any).user?.id,
    };

    const response = await this.gatewayService.routeRequest(gatewayRequest);

    // Set headers
    Object.entries(response.headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Set custom headers
    res.setHeader('X-Gateway-Target', response.targetUrl);
    res.setHeader('X-Gateway-Duration', response.duration.toString());
    res.status(response.status);

    return response.body;
  }
}
