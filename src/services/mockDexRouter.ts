import { randomInt } from 'crypto';
import { sleep } from '../utils/backoff';

export type DexName = 'raydium' | 'meteora';

export interface DexQuote {
  dex: DexName;
  amountIn: string; // as decimal string
  amountOut: string; // estimated out
  price: number; // amountOut / amountIn as number
  feePercent: number;
}

// Simulate realistic random variation and transient failures
export async function getQuote(dex: DexName, tokenIn: string, tokenOut: string, amount: number): Promise<DexQuote> {
  await sleep(100 + randomInt(300));

  const base = 1;

  const variation = (2 + Math.random() * 3) / 100;
  const bias = dex === 'raydium' ? -0.002 : 0.002;

  const price = base * (1 + (dex === 'raydium' ? -variation : variation) + bias);

  const feePercent = 0.002 + Math.random() * 0.002;

  const amountOut = amount * price * (1 - feePercent);

  return {
    dex,
    amountIn: amount.toString(),
    amountOut: amountOut.toString(),
    price,
    feePercent,
  };
}

export async function executeSwap(dex: DexName, tokenIn: string, tokenOut: string, amount: number): Promise<{ txHash: string } > {
  await sleep(2000 + randomInt(1000));

  const failChance = 0.08;
  if (Math.random() < failChance) {
    const err: any = new Error('Transient DEX execution error');
    err.transient = true;
    throw err;
  }

  const txHash = `${dex.toUpperCase()}-${Date.now()}-${randomInt(1e6)}`;
  return { txHash };
}
