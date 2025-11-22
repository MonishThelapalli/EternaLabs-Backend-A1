"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeOrderQueueEvents = initializeOrderQueueEvents;
exports.getOrderQueueEvents = getOrderQueueEvents;
exports.closeOrderQueueEvents = closeOrderQueueEvents;
const bullmq_1 = require("bullmq");
const pino_1 = __importDefault(require("pino"));
const websocket_manager_1 = require("../services/websocket-manager");
const logger = (0, pino_1.default)();
/**
 * Order Queue Events Listener
 *
 * Listens to BullMQ job events (progress, completed, failed)
 * and forwards them to WebSocket clients via the WebSocket Manager.
 *
 * This creates a real-time bridge:
 * Worker → BullMQ Events → QueueEvents → WebSocket Clients
 */
let queueEventsInstance = null;
/**
 * Initialize the queue events listener.
 * Should be called once on server startup.
 */
function initializeOrderQueueEvents() {
    if (queueEventsInstance) {
        return queueEventsInstance;
    }
    const queueEvents = new bullmq_1.QueueEvents('orders', {
        connection: {
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
        },
    });
    logger.info('Initializing Order Queue Events listener');
    /**
     * Listen to job progress events.
     * Worker calls job.updateProgress({ orderId, status, ... })
     * This event is triggered and we forward it to WebSocket clients.
     */
    queueEvents.on('progress', (args) => {
        try {
            const jobId = args.jobId;
            const progressData = args.data;
            logger.info({ jobId, progressData }, '🔥 PROGRESS EVENT RECEIVED');
            if (progressData && typeof progressData === 'object' && 'orderId' in progressData) {
                const { orderId, status, progress, message } = progressData;
                logger.info({ jobId, orderId, status, progress }, '✅ Progress event received and forwarding to WebSocket');
                // Send to WebSocket clients for this order
                websocket_manager_1.wsManager.sendToOrder(orderId, {
                    type: status, // e.g., "routing", "building", "submitted", "confirmed"
                    orderId,
                    status,
                    progress: progress || 0,
                    message: message || '',
                    timestamp: new Date().toISOString(),
                    ...progressData, // Include any other fields from the progress data
                });
            }
            else {
                logger.warn({ jobId, progressData }, 'Progress event missing orderId');
            }
        }
        catch (err) {
            logger.error({ err }, 'Error handling progress event');
        }
    });
    /**
     * Listen to job completion events.
     */
    queueEvents.on('completed', (args) => {
        try {
            const jobId = args.jobId;
            // In completed events, the return value is available
            // We need to get the job data from somewhere else or use metadata
            logger.debug({ jobId }, 'Job completed event received');
            // Note: completed event doesn't have job.data easily accessible
            // Progress events should have already sent the completion message
        }
        catch (err) {
            logger.error({ err }, 'Error handling completion event');
        }
    });
    /**
     * Listen to job failure events.
     */
    queueEvents.on('failed', (args) => {
        try {
            const jobId = args.jobId;
            const failedReason = args.failedReason;
            logger.debug({ jobId, failedReason }, 'Job failed event received');
            // Note: failed event doesn't have easy access to job.data
            // For now, rely on publishOrderUpdate from the worker
        }
        catch (err) {
            logger.error({ err }, 'Error handling failed event');
        }
    });
    /**
     * Listen to connection errors.
     */
    queueEvents.on('error', (err) => {
        logger.error({ err }, 'Queue Events error');
    });
    queueEventsInstance = queueEvents;
    logger.info('Order Queue Events listener initialized');
    return queueEvents;
}
/**
 * Get the queue events instance.
 */
function getOrderQueueEvents() {
    return queueEventsInstance;
}
/**
 * Clean up the queue events listener.
 */
async function closeOrderQueueEvents() {
    if (queueEventsInstance) {
        logger.info('Closing Order Queue Events listener');
        await queueEventsInstance.close();
        queueEventsInstance = null;
    }
}
