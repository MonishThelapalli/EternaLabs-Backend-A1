"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const pino_1 = __importDefault(require("pino"));
const uuid_1 = require("uuid");
const queue_1 = require("../queue");
const db_1 = require("../db");
const order_entity_1 = require("../models/order.entity");
const logger = (0, pino_1.default)();
const router = express_1.default.Router();
/**
 * POST /execute
 * Creates an order and enqueues it for processing.
 * Returns orderId and WebSocket URL for real-time updates.
 */
router.post('/execute', async (req, res) => {
    try {
        const { orderType, tokenIn, tokenOut, amount, slippage } = req.body;
        // Validation
        if (!tokenIn || !tokenOut || !amount) {
            return res.status(400).json({
                error: 'Bad Request',
                details: 'tokenIn, tokenOut, and amount are required',
            });
        }
        if (typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({
                error: 'Bad Request',
                details: 'amount must be a positive number',
            });
        }
        const orderId = (0, uuid_1.v4)();
        const orderRepo = db_1.AppDataSource.getRepository(order_entity_1.Order);
        // Create order in database
        const order = orderRepo.create({
            id: orderId,
            orderType: orderType || 'market',
            tokenIn,
            tokenOut,
            amount: amount.toString(),
            slippage: slippage || 0,
            status: 'pending',
        });
        await orderRepo.save(order);
        logger.info({ orderId, tokenIn, tokenOut, amount }, 'Order created');
        // Enqueue for processing
        try {
            const job = await (0, queue_1.enqueueOrder)({
                orderId,
                orderType: orderType || 'market',
                tokenIn,
                tokenOut,
                amount,
                slippage: slippage || 0,
            });
            logger.info({ orderId, jobId: job.id }, 'Order enqueued');
            // Build WebSocket URL for real-time status updates
            const host = req.get('host') || 'localhost:3000';
            const protocol = req.protocol === 'https' ? 'wss' : 'ws';
            const wsUrl = `${protocol}://${host}/api/orders/status/${orderId}`;
            return res.status(201).json({
                success: true,
                orderId,
                jobId: job.id,
                status: order.status,
                message: 'Order created and enqueued for processing',
                wsUrl: wsUrl,
                instructions: {
                    rest: `GET http://localhost:3000/api/orders/status/${orderId}`,
                    websocket: `Upgrade connection to ${wsUrl} for real-time updates`,
                },
            });
        }
        catch (err) {
            logger.error({ err, orderId }, 'Failed to enqueue order');
            return res.status(503).json({
                success: false,
                error: 'Service Unavailable',
                details: 'Failed to queue order. Redis may be unavailable.',
                orderId, // Still return the order ID so client can query status
            });
        }
    }
    catch (err) {
        logger.error({ err }, 'Error creating order');
        return res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: process.env.NODE_ENV === 'production' ? undefined : String(err),
        });
    }
});
/**
 * GET /status/:orderId
 * Retrieves the current status of an order (REST endpoint).
 *
 * NOTE: This is a REST endpoint that returns JSON.
 * To receive real-time updates, upgrade to WebSocket using the same URL path.
 * The HTTP server will automatically upgrade the connection when it's a WebSocket upgrade request.
 */
router.get('/status/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        if (!orderId || !orderId.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                details: 'orderId is required',
            });
        }
        const orderRepo = db_1.AppDataSource.getRepository(order_entity_1.Order);
        const order = await orderRepo.findOneBy({ id: orderId });
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                details: `Order ${orderId} not found`,
            });
        }
        return res.json({
            success: true,
            ...order,
            note: 'For real-time updates, upgrade to WebSocket on this same endpoint',
        });
    }
    catch (err) {
        logger.error({ err }, 'Error fetching order status');
        return res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: process.env.NODE_ENV === 'production' ? undefined : String(err),
        });
    }
});
exports.default = router;
