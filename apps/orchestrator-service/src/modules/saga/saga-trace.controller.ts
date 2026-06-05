import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { SagaTraceService } from './saga-trace.service';

@ApiTags('Saga Trace')
@Controller('saga')
export class SagaTraceController {
  constructor(private readonly traceService: SagaTraceService) {}

  @Get('trace/:orderId')
  @ApiOperation({ summary: 'Get full saga trace for an order' })
  @ApiParam({ name: 'orderId', description: 'UUID of the order' })
  getTrace(@Param('orderId') orderId: string) {
    return this.traceService.getTraceByOrderId(orderId);
  }
}
