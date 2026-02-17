import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ApiGatewayService } from './api-gateway.service';
import { ApiGatewayController } from './api-gateway.controller';
import { ApiRoute } from './entities/api-route.entity';

/**
 * API Gateway Module
 * Dynamic routing with load balancing and circuit breaker
 */
@Module({
  imports: [TypeOrmModule.forFeature([ApiRoute]), HttpModule],
  controllers: [ApiGatewayController],
  providers: [ApiGatewayService],
  exports: [ApiGatewayService],
})
export class ApiGatewayModule {}
