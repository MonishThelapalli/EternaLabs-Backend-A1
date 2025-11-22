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

test('order persistence simulation', async () => {
  const repo = testDataSource.getRepository(Order);
  const o = repo.create({
    orderType: 'market',
    tokenIn: 'A',
    tokenOut: 'B',
    amount: '5',
    slippage: 0.05,
    status: 'pending',
  });
  const saved = await repo.save(o);
  expect(saved.id).toBeTruthy();
  
  // simulate status update
  saved.status = 'routing';
  await repo.save(saved);
  
  const updated = await repo.findOneBy({ id: saved.id });
  expect(updated!.status).toBe('routing');
  
  // simulate confirmation
  saved.status = 'confirmed';
  saved.txHash = 'TEST-TX-HASH';
  await repo.save(saved);
  
  const final = await repo.findOneBy({ id: saved.id });
  expect(final!.status).toBe('confirmed');
  expect(final!.txHash).toBe('TEST-TX-HASH');
});
