import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { ProductStock } from './entities/product-stock.entity';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { StockConsumerService } from './stock-consumer.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductStock])],
  controllers: [ProductController],
  providers: [ProductService, StockConsumerService],
})
export class ProductModule {}
