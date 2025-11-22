"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const typeorm_1 = require("typeorm");
const order_entity_1 = require("../models/order.entity");
let testDataSource;
beforeAll(async () => {
    testDataSource = new typeorm_1.DataSource({
        type: 'sqlite',
        database: ':memory:',
        synchronize: true,
        logging: false,
        entities: [order_entity_1.Order],
    });
    await testDataSource.initialize();
});
afterAll(async () => {
    if (testDataSource?.isInitialized) {
        await testDataSource.destroy();
    }
});
test('can persist order entity', async () => {
    const repo = testDataSource.getRepository(order_entity_1.Order);
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
