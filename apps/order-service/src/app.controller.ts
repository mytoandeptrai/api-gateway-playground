import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello() {
    return this.appService.getHello();
  }

  @Get('health')
  @ApiTags('Health')
  @ApiOperation({ summary: 'Health check' })
  healthCheck() {
    return {
      status: 'ok',
      service: 'order-service',
      timestamp: new Date().toISOString(),
    };
  }
}
