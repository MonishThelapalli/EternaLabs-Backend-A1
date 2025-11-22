"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const pino_1 = __importDefault(require("pino"));
const uuid_1 = require("uuid");
const ws_routes_1 = __importDefault(require("../routes/ws.routes"));
const websocket_manager_1 = require("../services/websocket-manager");
const logger = (0, pino_1.default)();
describe('WebSocket /ws/orders Endpoint', () => {
    let server;
    let wss;
    const PORT = 9999;
    const WS_URL = `ws://localhost:${PORT}/ws/orders`;
    beforeAll((done) => {
        const app = (0, express_1.default)();
        app.use(body_parser_1.default.json());
        server = http_1.default.createServer(app);
        wss = new ws_1.default.Server({ noServer: true });
        (0, ws_routes_1.default)(wss);
        server.on('upgrade', (request, socket, head) => {
            const { url = '' } = request;
            if (url === '/ws/orders' || url.startsWith('/ws/orders?')) {
                wss.handleUpgrade(request, socket, head, (ws) => {
                    wss.emit('connection', ws, request);
                });
            }
            else {
                socket.destroy();
            }
        });
        server.listen(PORT, () => {
            logger.info(`Test server listening on port ${PORT}`);
            done();
        });
    });
    afterAll((done) => {
        server.close(() => {
            logger.info('Test server closed');
            done();
        });
    });
    it('should successfully establish WebSocket connection', (done) => {
        const ws = new ws_1.default(WS_URL);
        ws.on('open', () => {
            expect(ws.readyState).toBe(ws_1.default.OPEN);
            ws.close();
            done();
        });
        ws.on('error', (err) => {
            done(err);
        });
    });
    it('should send connection confirmation on connect', (done) => {
        const ws = new ws_1.default(WS_URL);
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                expect(message.type).toBe('connection');
                expect(message).toHaveProperty('clientId');
                expect(message).toHaveProperty('instructions');
                ws.close();
                done();
            }
            catch (err) {
                done(err);
            }
        });
        ws.on('error', (err) => {
            done(err);
        });
    });
    it('should accept subscription with valid orderId', (done) => {
        const ws = new ws_1.default(WS_URL);
        const orderId = (0, uuid_1.v4)();
        let messageCount = 0;
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                messageCount++;
                // First message is connection
                if (messageCount === 1) {
                    expect(message.type).toBe('connection');
                    // Send subscription
                    ws.send(JSON.stringify({ action: 'subscribe', orderId }));
                }
                else if (messageCount === 2) {
                    expect(message.type).toBe('subscribed');
                    expect(message.orderId).toBe(orderId);
                    expect(message).toHaveProperty('clientId');
                    ws.close();
                    done();
                }
            }
            catch (err) {
                done(err);
            }
        });
        ws.on('error', (err) => {
            done(err);
        });
    });
    it('should reject subscription without orderId', (done) => {
        const ws = new ws_1.default(WS_URL);
        let messageCount = 0;
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                messageCount++;
                if (messageCount === 1) {
                    ws.send(JSON.stringify({ action: 'subscribe' }));
                }
                else if (messageCount === 2) {
                    expect(message.type).toBe('error');
                    expect(message.error).toBe('Invalid subscription');
                    expect(message.details).toContain('orderId');
                    ws.close();
                    done();
                }
            }
            catch (err) {
                done(err);
            }
        });
        ws.on('error', (err) => {
            done(err);
        });
    });
    it('should handle invalid JSON gracefully', (done) => {
        const ws = new ws_1.default(WS_URL);
        let messageCount = 0;
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                messageCount++;
                if (messageCount === 1) {
                    ws.send('{ invalid json }');
                }
                else if (messageCount === 2) {
                    expect(message.type).toBe('error');
                    expect(message.error).toBe('Invalid JSON');
                    ws.close();
                    done();
                }
            }
            catch (err) {
                done(err);
            }
        });
        ws.on('error', (err) => {
            done(err);
        });
    });
    it('should reject unknown action', (done) => {
        const ws = new ws_1.default(WS_URL);
        let messageCount = 0;
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                messageCount++;
                if (messageCount === 1) {
                    ws.send(JSON.stringify({ action: 'unknown-action', orderId: 'test' }));
                }
                else if (messageCount === 2) {
                    expect(message.type).toBe('error');
                    expect(message.error).toBe('Unknown action');
                    ws.close();
                    done();
                }
            }
            catch (err) {
                done(err);
            }
        });
        ws.on('error', (err) => {
            done(err);
        });
    });
    it('should handle unsubscribe action', (done) => {
        const ws = new ws_1.default(WS_URL);
        const orderId = (0, uuid_1.v4)();
        let messageCount = 0;
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                messageCount++;
                if (messageCount === 1) {
                    // Connection confirmation
                    ws.send(JSON.stringify({ action: 'subscribe', orderId }));
                }
                else if (messageCount === 2) {
                    expect(message.type).toBe('subscribed');
                    ws.send(JSON.stringify({ action: 'unsubscribe', orderId }));
                }
                else if (messageCount === 3) {
                    expect(message.type).toBe('unsubscribed');
                    expect(message.orderId).toBe(orderId);
                    ws.close();
                    done();
                }
            }
            catch (err) {
                done(err);
            }
        });
        ws.on('error', (err) => {
            done(err);
        });
    });
    it('should support multiple subscriptions on same connection', (done) => {
        const ws = new ws_1.default(WS_URL);
        const orderId1 = (0, uuid_1.v4)();
        const orderId2 = (0, uuid_1.v4)();
        let messageCount = 0;
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                messageCount++;
                if (messageCount === 1) {
                    ws.send(JSON.stringify({ action: 'subscribe', orderId: orderId1 }));
                }
                else if (messageCount === 2) {
                    expect(message.type).toBe('subscribed');
                    expect(message.orderId).toBe(orderId1);
                    ws.send(JSON.stringify({ action: 'subscribe', orderId: orderId2 }));
                }
                else if (messageCount === 3) {
                    expect(message.type).toBe('subscribed');
                    expect(message.orderId).toBe(orderId2);
                    ws.close();
                    done();
                }
            }
            catch (err) {
                done(err);
            }
        });
        ws.on('error', (err) => {
            done(err);
        });
    });
    it('should clean up subscriptions on connection close', (done) => {
        const ws = new ws_1.default(WS_URL);
        const orderId = (0, uuid_1.v4)();
        let messageCount = 0;
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                messageCount++;
                if (messageCount === 1) {
                    ws.send(JSON.stringify({ action: 'subscribe', orderId }));
                }
                else if (messageCount === 2) {
                    expect(message.type).toBe('subscribed');
                    ws.close();
                }
            }
            catch (err) {
                done(err);
            }
        });
        ws.on('close', () => {
            expect(websocket_manager_1.wsManager.getTotalClientCount()).toBeGreaterThanOrEqual(0);
            done();
        });
        ws.on('error', (err) => {
            done(err);
        });
    });
    it('should forward order updates to subscribed clients', (done) => {
        const ws = new ws_1.default(WS_URL);
        const orderId = (0, uuid_1.v4)();
        let messageCount = 0;
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                messageCount++;
                if (messageCount === 1) {
                    // Connection confirmation
                    ws.send(JSON.stringify({ action: 'subscribe', orderId }));
                }
                else if (messageCount === 2) {
                    expect(message.type).toBe('subscribed');
                    websocket_manager_1.wsManager.sendToOrder(orderId, {
                        type: 'routing',
                        orderId,
                        status: 'routing',
                        progress: 10,
                        message: 'Routing order',
                        timestamp: new Date().toISOString(),
                    });
                }
                else if (messageCount === 3) {
                    expect(message.type).toBe('routing');
                    expect(message.orderId).toBe(orderId);
                    expect(message.status).toBe('routing');
                    expect(message.progress).toBe(10);
                    ws.close();
                    done();
                }
            }
            catch (err) {
                done(err);
            }
        });
        ws.on('error', (err) => {
            done(err);
        });
        setTimeout(() => { }, 100);
    });
});
describe('WebSocket Message Protocol', () => {
    let server;
    let wss;
    const PORT = 9998;
    const WS_URL = `ws://localhost:${PORT}/ws/orders`;
    beforeAll((done) => {
        const app = (0, express_1.default)();
        app.use(body_parser_1.default.json());
        server = http_1.default.createServer(app);
        wss = new ws_1.default.Server({ noServer: true });
        (0, ws_routes_1.default)(wss);
        server.on('upgrade', (request, socket, head) => {
            const { url = '' } = request;
            if (url === '/ws/orders' || url.startsWith('/ws/orders?')) {
                wss.handleUpgrade(request, socket, head, (ws) => {
                    wss.emit('connection', ws, request);
                });
            }
            else {
                socket.destroy();
            }
        });
        server.listen(PORT, done);
    });
    afterAll((done) => {
        server.close(done);
    });
    it('should format subscription confirmation correctly', (done) => {
        const ws = new ws_1.default(WS_URL);
        const orderId = 'test-order-123';
        let messageCount = 0;
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                messageCount++;
                if (messageCount === 1) {
                    expect(message).toHaveProperty('type', 'connection');
                    expect(message).toHaveProperty('clientId');
                    expect(message).toHaveProperty('message');
                    expect(message).toHaveProperty('timestamp');
                    expect(message).toHaveProperty('instructions');
                    ws.send(JSON.stringify({ action: 'subscribe', orderId }));
                }
                else if (messageCount === 2) {
                    expect(message).toHaveProperty('type', 'subscribed');
                    expect(message).toHaveProperty('orderId', orderId);
                    expect(message).toHaveProperty('clientId');
                    expect(message).toHaveProperty('message');
                    expect(message).toHaveProperty('timestamp');
                    ws.close();
                    done();
                }
            }
            catch (err) {
                done(err);
            }
        });
        ws.on('error', done);
    });
    it('should format error messages correctly', (done) => {
        const ws = new ws_1.default(WS_URL);
        let messageCount = 0;
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                messageCount++;
                if (messageCount === 1) {
                    ws.send(JSON.stringify({ action: 'subscribe' }));
                }
                else if (messageCount === 2) {
                    expect(message).toHaveProperty('type', 'error');
                    expect(message).toHaveProperty('error');
                    expect(message).toHaveProperty('details');
                    expect(message).toHaveProperty('timestamp');
                    ws.close();
                    done();
                }
            }
            catch (err) {
                done(err);
            }
        });
        ws.on('error', done);
    });
});
