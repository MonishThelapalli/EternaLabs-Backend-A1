"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const backoff_1 = require("../utils/backoff");
describe('backoff', () => {
    test('exponential backoff grows', () => {
        const a = (0, backoff_1.exponentialBackoffMs)(1);
        const b = (0, backoff_1.exponentialBackoffMs)(2);
        const c = (0, backoff_1.exponentialBackoffMs)(3);
        expect(a).toBeLessThan(b);
        expect(b).toBeLessThan(c);
    });
});
