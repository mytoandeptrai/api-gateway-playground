import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { randomUUID } from 'crypto';
import { Order, OrderStatus } from './entities/order.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

interface ProductResponse {
  id: string;
  name: string;
  price: number;
  stock: number;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OutboxEvent)
    private readonly outboxRepo: Repository<OutboxEvent>,
    private readonly dataSource: DataSource,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async create(userId: string, dto: CreateOrderDto) {
    const product = await this.fetchProduct(dto.productId);

    const totalAmount = product.price * dto.quantity;
    const paymentTimeoutMinutes = this.configService.get<number>('PAYMENT_TIMEOUT_MINUTES', 15);
    const paymentDeadline = new Date(Date.now() + paymentTimeoutMinutes * 60 * 1000);

    return this.dataSource.transaction(async (manager) => {
      const order = manager.create(Order, {
        userId,
        productId: dto.productId,
        productName: product.name,
        quantity: dto.quantity,
        unitPrice: product.price,
        totalAmount,
        shippingAddress: dto.shippingAddress,
        paymentDeadline,
        status: OrderStatus.PENDING_PAYMENT,
      });
      await manager.save(order);

      const outboxEvent = manager.create(OutboxEvent, {
        aggregateId: order.id,
        eventType: 'order.created',
        payload: {
          eventId: randomUUID(),
          eventType: 'order.created',
          sagaId: '',
          orderId: order.id,
          userId,
          correlationId: randomUUID(),
          timestamp: new Date().toISOString(),
          payload: {
            orderId: order.id,
            userId,
            productId: dto.productId,
            quantity: dto.quantity,
            totalAmount,
            shippingAddress: dto.shippingAddress,
            paymentDeadline: paymentDeadline.toISOString(),
          },
        },
        published: false,
      });
      await manager.save(outboxEvent);

      this.logger.log(`Order created: ${order.id} for user ${userId}`);

      return {
        orderId: order.id,
        totalAmount,
        paymentDeadline,
      };
    });
  }

  async findAllByUser(userId: string): Promise<Order[]> {
    return this.orderRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOneByUser(id: string, userId: string): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id, userId } });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');

    order.status = dto.status;
    if (dto.reason) order.cancelReason = dto.reason;
    if (dto.sagaId) order.sagaId = dto.sagaId;
    if (dto.trackingId) order.trackingId = dto.trackingId;
    if (dto.status === OrderStatus.DELIVERED) order.deliveredAt = new Date();

    return this.orderRepo.save(order);
  }

  private async fetchProduct(productId: string): Promise<ProductResponse> {
    const baseUrl = this.configService.get<string>('PRODUCT_SERVICE_URL', 'http://localhost:3005');
    const apiPrefix = 'api/v1';

    try {
      const response = await firstValueFrom(
        this.httpService.get<{ data: ProductResponse }>(`${baseUrl}/${apiPrefix}/products/${productId}`),
      );
      const product = response.data.data;
      if (!product) throw new BadRequestException('Product not found');
      return product;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Failed to fetch product ${productId}`, error);
      throw new BadRequestException(`Product ${productId} not found or unavailable`);
    }
  }
}
