"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderQueue = exports.redisConnection = void 0;
exports.enqueueOrder = enqueueOrder;
exports.getRedisConnection = getRedisConnection;
exports.getOrderQueue = getOrderQueue;
exports.closeQueue = closeQueue;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)();
/**
 * BullMQ connection with proper settings for production.
 * maxRetriesPerRequest: null ensures connection pooling works correctly with BullMQ v4.
 */
exports.redisConnection = new ioredis_1.default({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    maxRetriesPerRequest: null, // Critical for BullMQ v4
    enableReadyCheck: false,
    lazyConnect: false,
});
// Redis event handlers
exports.redisConnection.on('connect', () => {
    logger.info('Redis connection established for queue');
});
exports.redisConnection.on('error', (err) => {
    logger.error({ err }, 'Redis connection error for queue');
});
exports.redisConnection.on('ready', () => {
    logger.debug('Redis ready for queue');
});
exports.redisConnection.on('close', () => {
    logger.warn('Redis connection closed for queue');
});
/**
 * Order queue instance using BullMQ.
 * Uses the same connection as above.
 */
exports.orderQueue = new bullmq_1.Queue('orders', {
    connection: exports.redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 500,
        },
        removeOnComplete: {
            age: 3600, // Keep completed jobs for 1 hour
        },
        removeOnFail: {
            age: 86400, // Keep failed jobs for 24 hours
        },
    },
});
/**
 * Enqueues an order for processing.
 * Returns a Job instance with the job ID.
 */
async function enqueueOrder(data) {
    try {
        const job = await exports.orderQueue.add('execute-order', data, {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 500,
            },
        });
        logger.info({ jobId: job.id, orderId: data.orderId }, 'Order enqueued');
        return job;
    }
    catch (err) {
        logger.error({ err, orderId: data.orderId }, 'Failed to enqueue order');
        throw err;
    }
}
/**
 * Get the Redis connection for external use (e.g., Pub/Sub, event listeners).
 */
function getRedisConnection() {
    return exports.redisConnection;
}
/**
 * Get the order queue for external use (e.g., event listeners).
 */
function getOrderQueue() {
    return exports.orderQueue;
}
/**
 * Gracefully close the queue and connection.
 */
async function closeQueue() {
    try {
        await exports.orderQueue.close();
        await exports.redisConnection.quit();
        logger.info('Queue and Redis connection closed');
    }
    catch (err) {
        logger.error({ err }, 'Error closing queue and connection');
    }
}
