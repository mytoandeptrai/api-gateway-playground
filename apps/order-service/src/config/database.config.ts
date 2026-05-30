import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 1111,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'mydb',
  schema: process.env.DB_SCHEMA || 'public',
  synchronize: process.env.DB_SYNC === 'true',
  logging: process.env.DB_LOGGING === 'true',
}));
