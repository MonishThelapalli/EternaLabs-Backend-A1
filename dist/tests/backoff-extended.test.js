"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const backoff_1 = require("../utils/backoff");
describe('Backoff utility', () => {
    test('exponential backoff values increase correctly', () => {
        expect((0, backoff_1.exponentialBackoffMs)(1)).toBe(500);
        expect((0, backoff_1.exponentialBackoffMs)(2)).toBe(1000);
        expect((0, backoff_1.exponentialBackoffMs)(3)).toBe(2000);
        expect((0, backoff_1.exponentialBackoffMs)(4)).toBe(4000);
    });
    test('sleep resolves after delay', async () => {
        const start = Date.now();
        await (0, backoff_1.sleep)(100);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(100);
    });
});
