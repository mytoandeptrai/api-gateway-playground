import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from './product.entity';
import { ProductStock } from './entities/product-stock.entity';

export type ProductWithStock = Product & { available: number };

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductStock)
    private readonly stockRepository: Repository<ProductStock>,
  ) {}

  async findAll(): Promise<{ data: ProductWithStock[]; total: number }> {
    const [products, total] = await this.productRepository.findAndCount({
      order: { createdAt: 'DESC' },
    });

    const stocks = await this.stockRepository.find({
      where: { productId: In(products.map((p) => p.id)) },
    });
    const stockMap = new Map(stocks.map((s) => [s.productId, s.available]));

    return {
      data: products.map((p) => ({
        ...p,
        available: stockMap.get(p.id) ?? p.stock,
      })),
      total,
    };
  }

  async findOne(id: string): Promise<ProductWithStock> {
    const product = await this.productRepository.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');

    const stock = await this.stockRepository.findOne({
      where: { productId: id },
    });

    return { ...product, available: stock?.available ?? product.stock };
  }
}
