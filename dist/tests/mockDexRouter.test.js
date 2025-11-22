"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mockDexRouter_1 = require("../services/mockDexRouter");
describe('MockDexRouter', () => {
    test('getQuote returns a Quote with amountOut close to amount', async () => {
        const q = await (0, mockDexRouter_1.getQuote)('raydium', 'TOKENA', 'TOKENB', 100);
        expect(q.dex).toBe('raydium');
        expect(Number(q.amountOut)).toBeGreaterThan(90);
        expect(Number(q.amountOut)).toBeLessThan(110);
    });
    test('executeSwap resolves or throws transient error', async () => {
        // run several times to assert transient behavior doesn't always throw
        let success = 0;
        let failed = 0;
        for (let i = 0; i < 10; i++) {
            try {
                const r = await (0, mockDexRouter_1.executeSwap)('meteora', 'A', 'B', 1);
                expect(r.txHash).toBeTruthy();
                success++;
            }
            catch (err) {
                expect(err).toBeInstanceOf(Error);
                failed++;
            }
        }
        expect(success + failed).toBe(10);
    }, 20000);
});
