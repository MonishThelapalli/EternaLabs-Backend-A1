"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQuote = getQuote;
exports.executeSwap = executeSwap;
const crypto_1 = require("crypto");
const backoff_1 = require("../utils/backoff");
// Simulate realistic random variation and transient failures
async function getQuote(dex, tokenIn, tokenOut, amount) {
    // simulate network latency 100-400ms
    await (0, backoff_1.sleep)(100 + (0, crypto_1.randomInt)(300));
    // base price: pretend 1 tokenIn = 1 tokenOut
    const base = 1;
    // random variation of 2-5%
    const variation = (2 + Math.random() * 3) / 100; // 0.02 - 0.05
    // small dex bias
    const bias = dex === 'raydium' ? -0.002 : 0.002;
    const price = base * (1 + (dex === 'raydium' ? -variation : variation) + bias);
    // fee percent 0.2-0.4%
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
// Simulate executing a swap: delay 2-3s, 5-10% chance transient failure
async function executeSwap(dex, tokenIn, tokenOut, amount) {
    // 2-3s delay
    await (0, backoff_1.sleep)(2000 + (0, crypto_1.randomInt)(1000));
    // transient failure chance 8%
    const failChance = 0.08;
    if (Math.random() < failChance) {
        const err = new Error('Transient DEX execution error');
        err.transient = true;
        throw err;
    }
    // success: return fake txHash
    const txHash = `${dex.toUpperCase()}-${Date.now()}-${(0, crypto_1.randomInt)(1e6)}`;
    return { txHash };
}
