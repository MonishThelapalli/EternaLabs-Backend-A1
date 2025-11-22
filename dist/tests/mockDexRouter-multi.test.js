"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mockDexRouter_1 = require("../services/mockDexRouter");
describe('MockDexRouter - Multiple Quotes', () => {
    test('quote variation is within 2-5% range', async () => {
        const amounts = [];
        for (let i = 0; i < 5; i++) {
            const q = await (0, mockDexRouter_1.getQuote)('raydium', 'A', 'B', 100);
            amounts.push(Number(q.amountOut));
        }
        const min = Math.min(...amounts);
        const max = Math.max(...amounts);
        const variance = (max - min) / min;
        expect(variance).toBeLessThan(0.1);
    }, 10000);
    test('meteora and raydium have different prices', async () => {
        const raydium = await (0, mockDexRouter_1.getQuote)('raydium', 'A', 'B', 100);
        const meteora = await (0, mockDexRouter_1.getQuote)('meteora', 'A', 'B', 100);
        const rayOut = Number(raydium.amountOut);
        const metOut = Number(meteora.amountOut);
        expect(rayOut).not.toBe(metOut);
    }, 10000);
});
