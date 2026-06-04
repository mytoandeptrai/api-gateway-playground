import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PaymentService } from './payment.service';

@ApiTags('payment')
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('create-qr')
  @ApiOperation({ summary: 'Internal: create VNPay QR for an order' })
  createQR(@Body() body: { orderId: string; amount: number; sagaId: string }) {
    return this.paymentService.createQR(body);
  }

  @Get('vnpay-webhook')
  @ApiOperation({ summary: 'VNPay IPN webhook (GET)' })
  handleIPNGet(@Query() query: Record<string, string>) {
    return this.paymentService.handleIPN(query);
  }

  @Post('vnpay-webhook')
  @ApiOperation({ summary: 'VNPay IPN webhook (POST)' })
  handleIPNPost(@Body() body: Record<string, string>) {
    return this.paymentService.handleIPN(body);
  }

  @Get(':orderId/status')
  @ApiOperation({ summary: 'Get payment status for an order' })
  getStatus(@Param('orderId') orderId: string) {
    return this.paymentService.getStatus(orderId);
  }

  @Post('refund')
  @ApiOperation({ summary: 'Internal: process refund' })
  processRefund(
    @Body() body: { orderId: string; amount: number; reason: string },
  ) {
    return this.paymentService.processRefund(body);
  }

  @Get('verify-return')
  @ApiOperation({
    summary: 'Verify VNPay return URL params and process payment',
  })
  verifyReturn(@Query() query: Record<string, string>) {
    return this.paymentService.handleIPN(query);
  }

  @Get('test-url')
  @ApiOperation({ summary: 'Test: generate VNPay payment URL' })
  testPaymentUrl() {
    return this.paymentService.testPaymentUrl();
  }

  @Post(':orderId/simulate-failure')
  @ApiOperation({ summary: 'Dev only: simulate payment failure for an order' })
  simulateFailure(
    @Param('orderId') orderId: string,
    @Body() body: { responseCode?: string },
  ) {
    if (process.env.NODE_ENV !== 'development') {
      throw new ForbiddenException('Only available in development');
    }
    return this.paymentService.simulateFailure(orderId, body.responseCode);
  }
}
