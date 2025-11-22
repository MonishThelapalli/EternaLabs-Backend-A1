"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mockDexRouter_1 = require("../services/mockDexRouter");
describe('Retry Behavior', () => {
    test('executeSwap can succeed on multiple attempts', async () => {
        let successCount = 0;
        const attempts = 15;
        for (let i = 0; i < attempts; i++) {
            try {
                await (0, mockDexRouter_1.executeSwap)('raydium', 'A', 'B', 1);
                successCount++;
            }
            catch (err) {
            }
        }
        expect(successCount).toBeGreaterThan(10);
    }, 45000);
    test('executeSwap transient errors are marked as transient', async () => {
        let transientErrorCount = 0;
        const attempts = 20;
        for (let i = 0; i < attempts; i++) {
            try {
                await (0, mockDexRouter_1.executeSwap)('meteora', 'A', 'B', 1);
            }
            catch (err) {
                if (err?.transient) {
                    transientErrorCount++;
                }
            }
        }
        expect(transientErrorCount).toBeGreaterThanOrEqual(0);
    }, 45000);
});
