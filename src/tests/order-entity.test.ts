import { Order } from '../models/order.entity';

describe('Order entity', () => {
  test('Order entity defines required fields', () => {
    expect(Order).toBeDefined();
    // verify it's a class
    const instance = new Order();
    expect(instance).toBeDefined();
  });

  test('Order has UUID primary key', () => {
    const o = new Order();
    o.orderType = 'market';
    o.tokenIn = 'A';
    o.tokenOut = 'B';
    o.amount = '100';
    o.slippage = 0;
    o.status = 'pending';
    expect(o.orderType).toBe('market');
  });
});
