import dataSource from '../data-source';

async function runSeed() {
  await dataSource.initialize();
  // Create tables from entities if they don't exist yet
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
