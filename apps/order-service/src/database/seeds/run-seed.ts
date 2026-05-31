import { faker } from '@faker-js/faker';
import dataSource from '../data-source';
import { Order, OrderStatus } from 'src/modules/orders/entities/order.entity';

async function runSeed() {
  await dataSource.initialize();
  // Ensure schema and tables exist before seeding
  const schema = process.env.DB_SCHEMA || 'public';
  await dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await dataSource.synchronize();

  console.log('Data source initialized. Running order seeds...');

  const orderRepo = dataSource.getRepository(Order);
  const statuses = Object.values(OrderStatus);

  for (let i = 0; i < 10; i++) {
    const unitPrice = parseFloat(
      faker.commerce.price({ min: 50000, max: 5000000 }),
    );
    const quantity = faker.number.int({ min: 1, max: 3 });

    const order = orderRepo.create({
      userId: faker.string.uuid(),
      productId: faker.string.uuid(),
      productName: faker.commerce.productName(),
      quantity,
      unitPrice,
      totalAmount: parseFloat((unitPrice * quantity).toFixed(2)),
      shippingAddress: {
        fullName: faker.person.fullName(),
        phone: `09${faker.string.numeric(8)}`,
        address: faker.location.streetAddress(),
        city: faker.location.city(),
      },
      paymentDeadline: new Date(Date.now() + 15 * 60 * 1000),
      status: faker.helpers.arrayElement(statuses),
    });

    await orderRepo.save(order);
  }

  console.log('Seeded 10 sample orders.');
  await dataSource.destroy();
}

runSeed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
