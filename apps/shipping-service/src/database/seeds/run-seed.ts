import dataSource from '../data-source';

async function runSeed() {
  await dataSource.initialize();
  // Ensure schema and tables exist before seeding
  const schema = process.env.DB_SCHEMA || 'public';
  await dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await dataSource.synchronize();

  console.log('Data source initialized. Running seeds...');

  // Add seed logic here
  // Example:
  // const userRepo = dataSource.getRepository(User);
  // await userRepo.save([...]);

  console.log('Seeding complete.');
  await dataSource.destroy();
}

runSeed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
