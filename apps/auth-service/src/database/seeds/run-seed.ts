import bcrypt from 'bcryptjs';
import dataSource from '../data-source';
import { User } from 'src/modules/users/user.entity';

async function runSeed() {
  await dataSource.initialize();
  // Create tables from entities if they don't exist yet
  await dataSource.synchronize();

  console.log('Data source initialized. Running auth seeds...');

  const userRepo = dataSource.getRepository(User);

  const testUser = {
    email: 'test@nextmart.com',
    password: await bcrypt.hash('Test@123', 10),
    name: 'Test User',
  };

  const exists = await userRepo.findOne({ where: { email: testUser.email } });
  if (!exists) {
    await userRepo.save(userRepo.create(testUser));
    console.log(`✓ Seeded user: ${testUser.email}`);
  } else {
    console.log(`- Skipped (exists): ${testUser.email}`);
  }

  console.log('Auth seeding complete.');
  await dataSource.destroy();
}

runSeed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
