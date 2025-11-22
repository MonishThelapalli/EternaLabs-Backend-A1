import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Order } from '../models/order.entity';

let testDataSource: DataSource;

beforeAll(async () => {
  testDataSource = new DataSource({
    type: 'sqlite',
    database: ':memory:',
    synchronize: true,
    logging: false,
    entities: [Order],
  });
  await testDataSource.initialize();
});

afterAll(async () => {
  if (testDataSource?.isInitialized) {
    await testDataSource.destroy();
  }
});

test('can persist order entity', async () => {
  const repo = testDataSource.getRepository(Order);
  const o = repo.create({
    orderType: 'market',
    tokenIn: 'A',
    tokenOut: 'B',
    amount: '10',
    slippage: 0.01,
    status: 'pending',
  });
  const saved = await repo.save(o);
  expect(saved.id).toBeTruthy();
  expect(saved.createdAt).toBeInstanceOf(Date);
});
