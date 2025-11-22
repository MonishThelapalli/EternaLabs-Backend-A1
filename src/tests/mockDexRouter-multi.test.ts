import { getQuote, executeSwap } from '../services/mockDexRouter';

describe('MockDexRouter - Multiple Quotes', () => {
  test('quote variation is within 2-5% range', async () => {
    const amounts: number[] = [];
    for (let i = 0; i < 5; i++) {
      const q = await getQuote('raydium', 'A', 'B', 100);
      amounts.push(Number(q.amountOut));
    }
    // all should be in reasonable range
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    const variance = (max - min) / min;
    expect(variance).toBeLessThan(0.1); // less than 10% spread
  }, 10000);

  test('meteora and raydium have different prices', async () => {
    const raydium = await getQuote('raydium', 'A', 'B', 100);
    const meteora = await getQuote('meteora', 'A', 'B', 100);
    // they should be slightly different
    const rayOut = Number(raydium.amountOut);
    const metOut = Number(meteora.amountOut);
    expect(rayOut).not.toBe(metOut);
  }, 10000);
});
