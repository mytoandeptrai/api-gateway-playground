import { faker } from '@faker-js/faker';
import dataSource from '../data-source';
import { Order, OrderStatus } from 'src/modules/orders/entities/order.entity';
import { OrderItem } from 'src/modules/orders/entities/order-item.entity';

async function runSeed() {
  await dataSource.initialize();
  console.log('Data source initialized. Running order seeds...');

  const orderRepo = dataSource.getRepository(Order);
  const orderItemRepo = dataSource.getRepository(OrderItem);

  const statuses = Object.values(OrderStatus);

  for (let i = 0; i < 15; i++) {
    const itemCount = faker.number.int({ min: 1, max: 4 });
    const items: Partial<OrderItem>[] = Array.from(
      { length: itemCount },
      () => ({
        productName: faker.commerce.productName(),
        price: parseFloat(faker.commerce.price({ min: 5, max: 200 })),
        quantity: faker.number.int({ min: 1, max: 5 }),
      }),
    );

    const totalAmount = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    const order = orderRepo.create({
      customerEmail: faker.internet.email().toLowerCase(),
      customerName: faker.person.fullName(),
      status: faker.helpers.arrayElement(statuses),
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      items: items.map((item) => orderItemRepo.create(item)),
    });

    await orderRepo.save(order);
  }

  console.log('Seeded 15 orders with items.');
  await dataSource.destroy();
}

runSeed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
