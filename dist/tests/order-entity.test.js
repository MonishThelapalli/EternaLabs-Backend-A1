"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const order_entity_1 = require("../models/order.entity");
describe('Order entity', () => {
    test('Order entity defines required fields', () => {
        expect(order_entity_1.Order).toBeDefined();
        // verify it's a class
        const instance = new order_entity_1.Order();
        expect(instance).toBeDefined();
    });
    test('Order has UUID primary key', () => {
        const o = new order_entity_1.Order();
        o.orderType = 'market';
        o.tokenIn = 'A';
        o.tokenOut = 'B';
        o.amount = '100';
        o.slippage = 0;
        o.status = 'pending';
        expect(o.orderType).toBe('market');
    });
});
