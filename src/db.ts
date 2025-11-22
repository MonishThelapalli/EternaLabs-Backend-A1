import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Order } from './models/order.entity';

function getDataSourceConfig(): DataSourceOptions {
  // Check for SQLite (used in dev/test). Default to sqlite for local dev
  const dbType = process.env.DB_TYPE || 'sqlite';
  const isSqlite = dbType === 'sqlite' || process.env.DB_NAME === ':memory:';
  
  if (isSqlite) {
    return {
      type: 'sqlite',
      database: process.env.DB_NAME || ':memory:',
      synchronize: true,
      logging: false,
      entities: [Order],
    } as DataSourceOptions;
  }
  
  return {
    type: 'postgres',
    database: process.env.DB_NAME || 'orderdb',
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres',
    synchronize: true,
    logging: false,
    entities: [Order],
  } as DataSourceOptions;
}

export const AppDataSource = new DataSource(getDataSourceConfig());
