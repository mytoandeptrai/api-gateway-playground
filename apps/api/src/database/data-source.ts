import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 1111,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'mydb',
  schema: process.env.DB_SCHEMA || 'public',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  migrationsTableName: 'migrations_api',
  ssl: process.env.NODE_ENV === 'production' ? true : false,
});
