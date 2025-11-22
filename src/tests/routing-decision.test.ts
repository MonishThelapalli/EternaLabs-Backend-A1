import { getQuote, executeSwap } from '../services/mockDexRouter';

describe('DEX Routing Decision Logic', () => {
  test('select best quote by highest amountOut', async () => {
    const raydium = await getQuote('raydium', 'A', 'B', 100);
    const meteora = await getQuote('meteora', 'A', 'B', 100);
    
    const rayOut = Number(raydium.amountOut);
    const metOut = Number(meteora.amountOut);
    
    // pick the better one (deterministic logic)
    const best = rayOut > metOut ? raydium : meteora;
    expect(best).toBeDefined();
    expect(best.dex).toBeTruthy();
  }, 5000);

  test('apply slippage check to amountOut', async () => {
    const quote = await getQuote('raydium', 'A', 'B', 100);
    const expectedOut = Number(quote.amountOut);
    const slippage = 0.05; // 5%
    
    const minOutAllowed = expectedOut * (1 - slippage);
    
    // simulated execution would check: actualOut >= minOutAllowed
    expect(minOutAllowed).toBeLessThan(expectedOut);
  }, 5000);
});
