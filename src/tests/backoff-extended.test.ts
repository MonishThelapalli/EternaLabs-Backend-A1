import { exponentialBackoffMs, sleep } from '../utils/backoff';

describe('Backoff utility', () => {
  test('exponential backoff values increase correctly', () => {
    expect(exponentialBackoffMs(1)).toBe(500);
    expect(exponentialBackoffMs(2)).toBe(1000);
    expect(exponentialBackoffMs(3)).toBe(2000);
    expect(exponentialBackoffMs(4)).toBe(4000);
  });

  test('sleep resolves after delay', async () => {
    const start = Date.now();
    await sleep(100);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });
});
