import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { JwtAuthGuard } from '@/shared/guards/jwt-auth.guard';

interface AuthRequest extends Request {
  user: { id: string; email: string; role: string };
}

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new order' })
  @ApiResponse({ status: 201, description: 'Order created — returns orderId, totalAmount, paymentDeadline' })
  create(@Request() req: AuthRequest, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(req.user.id, req.user.email, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get all orders for current user' })
  findAll(@Request() req: AuthRequest) {
    return this.ordersService.findAllByUser(req.user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get order detail by ID' })
  findOne(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.ordersService.findOneByUser(id, req.user.id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update order status (internal service-to-service)' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto);
  }
}
