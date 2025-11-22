import { exponentialBackoffMs } from '../utils/backoff';

describe('backoff', () => {
  test('exponential backoff grows', () => {
    const a = exponentialBackoffMs(1);
    const b = exponentialBackoffMs(2);
    const c = exponentialBackoffMs(3);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});
