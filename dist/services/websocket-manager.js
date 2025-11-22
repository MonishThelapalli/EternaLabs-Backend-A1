"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wsManager = exports.WebSocketManager = void 0;
const ws_1 = __importDefault(require("ws"));
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)();
class WebSocketManager {
    constructor() {
        this.connections = new Map();
    }
    register(orderId, ws) {
        if (!this.connections.has(orderId)) {
            this.connections.set(orderId, new Set());
        }
        this.connections.get(orderId).add(ws);
        logger.debug({
            orderId,
            clientCount: this.connections.get(orderId).size,
            totalOrders: this.connections.size,
        }, 'WebSocket client registered');
        // Send connection acknowledgment
        this.sendToOrder(orderId, {
            type: 'connection',
            message: 'Connected to order status stream',
            orderId,
            timestamp: new Date().toISOString(),
        });
        ws.on('close', () => {
            this.unregister(orderId, ws);
        });
        ws.on('error', (err) => {
            logger.warn({ err, orderId }, 'WebSocket error');
            this.unregister(orderId, ws);
        });
    }
    unregister(orderId, ws) {
        const clients = this.connections.get(orderId);
        if (!clients)
            return;
        clients.delete(ws);
        if (clients.size === 0) {
            this.connections.delete(orderId);
            logger.debug({ orderId }, 'All WebSocket clients disconnected, removed order from registry');
        }
        else {
            logger.debug({ orderId, remainingClients: clients.size }, 'WebSocket client unregistered');
        }
    }
    sendToOrder(orderId, message) {
        const clients = this.connections.get(orderId);
        if (!clients || clients.size === 0) {
            return;
        }
        const payload = typeof message === 'string' ? message : JSON.stringify(message);
        let sentCount = 0;
        let failedCount = 0;
        clients.forEach((ws) => {
            if (ws.readyState === ws_1.default.OPEN) {
                try {
                    ws.send(payload);
                    sentCount++;
                }
                catch (err) {
                    logger.warn({ err, orderId }, 'Failed to send WebSocket message');
                    failedCount++;
                }
            }
        });
        if (sentCount > 0 || failedCount > 0) {
            logger.debug({ orderId, sent: sentCount, failed: failedCount }, 'Messages sent to order clients');
        }
    }
    broadcast(message) {
        const payload = typeof message === 'string' ? message : JSON.stringify(message);
        let totalSent = 0;
        let totalFailed = 0;
        this.connections.forEach((clients, orderId) => {
            let sent = 0;
            let failed = 0;
            clients.forEach((ws) => {
                if (ws.readyState === ws_1.default.OPEN) {
                    try {
                        ws.send(payload);
                        sent++;
                        totalSent++;
                    }
                    catch (err) {
                        logger.warn({ err, orderId }, 'Failed to broadcast message');
                        failed++;
                        totalFailed++;
                    }
                }
            });
        });
        logger.debug({ totalSent, totalFailed, ordersWithClients: this.connections.size }, 'Broadcast complete');
    }
    getClientCount(orderId) {
        return this.connections.get(orderId)?.size ?? 0;
    }
    getTotalClientCount() {
        let total = 0;
        this.connections.forEach((clients) => {
            total += clients.size;
        });
        return total;
    }
    getConnectedOrderCount() {
        return this.connections.size;
    }
    closeAll() {
        let closedCount = 0;
        this.connections.forEach((clients, orderId) => {
            clients.forEach((ws) => {
                if (ws.readyState === ws_1.default.OPEN) {
                    ws.close(1001, 'Server shutting down');
                    closedCount++;
                }
            });
        });
        this.connections.clear();
        logger.info({ closedCount }, 'All WebSocket connections closed');
    }
}
exports.WebSocketManager = WebSocketManager;
exports.wsManager = new WebSocketManager();
