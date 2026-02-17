import { faker } from '@faker-js/faker';
import dataSource from '../data-source';
import { User } from 'src/modules/users/user.entity';

async function runSeed() {
  await dataSource.initialize();
  console.log('Data source initialized. Running auth seeds...');

  const userRepo = dataSource.getRepository(User);

  const users: Partial<User>[] = Array.from({ length: 20 }, () => ({
    email: faker.internet.email().toLowerCase(),
    password: faker.internet.password({ length: 12 }),
  }));

  // Add a known test user
  users.unshift({
    email: 'admin@test.com',
    password: 'password123',
  });

  for (const user of users) {
    const exists = await userRepo.findOne({ where: { email: user.email } });
    if (!exists) {
      await userRepo.save(userRepo.create(user));
    }
  }

  console.log(`Seeded ${users.length} users.`);
  await dataSource.destroy();
}

runSeed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
