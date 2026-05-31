import bcrypt from 'bcryptjs';
import dataSource from '../data-source';
import { User } from 'src/modules/users/user.entity';

async function runSeed() {
  await dataSource.initialize();
  // Ensure schema and tables exist before seeding
  const schema = process.env.DB_SCHEMA || 'public';
  await dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
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
