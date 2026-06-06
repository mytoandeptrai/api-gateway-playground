import dataSource from '../data-source';
import { User } from '../../users/user.entity';
import { Post } from '../../posts/post.entity';

async function runSeed() {
  await dataSource.initialize();
  console.log('Data source initialized. Running seeds...');

  const userRepo = dataSource.getRepository(User);
  const postRepo = dataSource.getRepository(Post);

  const users = await userRepo.save([
    { email: 'alice@example.com', password: 'hashed_password_1' },
    { email: 'bob@example.com', password: 'hashed_password_2' },
    { email: 'charlie@example.com', password: 'hashed_password_3' },
  ]);
  console.log(`Seeded ${users.length} users`);

  const posts = await postRepo.save([
    { title: 'Hello World', content: 'First post by Alice', userId: users[0].id },
    { title: 'TypeORM Tips', content: 'How to use relations in TypeORM', userId: users[0].id },
    { title: 'NestJS Guide', content: 'Building APIs with NestJS', userId: users[1].id },
    { title: 'Kafka Intro', content: 'Event-driven architecture with Kafka', userId: users[2].id },
  ]);
  console.log(`Seeded ${posts.length} posts`);

  console.log('Seeding complete.');
  await dataSource.destroy();
}

runSeed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
