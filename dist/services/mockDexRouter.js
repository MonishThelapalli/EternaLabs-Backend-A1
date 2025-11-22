"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQuote = getQuote;
exports.executeSwap = executeSwap;
const crypto_1 = require("crypto");
const backoff_1 = require("../utils/backoff");
async function getQuote(dex, tokenIn, tokenOut, amount) {
    await (0, backoff_1.sleep)(100 + (0, crypto_1.randomInt)(300));
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
async function executeSwap(dex, tokenIn, tokenOut, amount) {
    await (0, backoff_1.sleep)(2000 + (0, crypto_1.randomInt)(1000));
    const failChance = 0.08;
    if (Math.random() < failChance) {
        const err = new Error('Transient DEX execution error');
        err.transient = true;
        throw err;
    }
    const txHash = `${dex.toUpperCase()}-${Date.now()}-${(0, crypto_1.randomInt)(1e6)}`;
    return { txHash };
}
