import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseTopicHandler } from './base-topic.handler';
import { InventoryService, KafkaEnvelope } from '../../inventory.service';

@Injectable()
export class ReserveStockHandler extends BaseTopicHandler<KafkaEnvelope> {
  constructor(
    configService: ConfigService,
    private readonly inventoryService: InventoryService,
  ) {
    super(configService);
  }

  getTopic(): string {
    return 'inventory.reserve_stock';
  }

  async handle(event: KafkaEnvelope): Promise<void> {
    await this.inventoryService.reserveStock(event);
  }
}
