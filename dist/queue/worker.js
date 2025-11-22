"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishOrderUpdate = publishOrderUpdate;
exports.processOrder = processOrder;
const bullmq_1 = require("bullmq");
const pino_1 = __importDefault(require("pino"));
const db_1 = require("../db");
const order_entity_1 = require("../models/order.entity");
const mockDexRouter_1 = require("../services/mockDexRouter");
const backoff_1 = require("../utils/backoff");
const index_1 = require("./index");
const queue_events_1 = require("../services/queue-events");
const logger = (0, pino_1.default)();
/**
 * Publisher instance for Redis Pub/Sub.
 * Reuses the connection from queue/index to avoid connection exhaustion.
 */
const publisher = index_1.redisConnection;
/**
 * Helper to publish progress or status updates via Redis Pub/Sub.
 * This is used both in the job processor and monitored externally.
 */
async function publishOrderUpdate(orderId, type, payload = {}) {
    try {
        const channel = `order:${orderId}`;
        const message = JSON.stringify({
            type,
            orderId,
            timestamp: new Date().toISOString(),
            ...payload,
        });
        const count = await publisher.publish(channel, message);
        logger.debug({ orderId, type, channel, subscribers: count }, 'Order update published');
    }
    catch (err) {
        logger.warn({ err, orderId }, 'Failed to publish order update');
    }
}
/**
 * Main order processing logic.
 * Handles routing, quoting, and execution with retries.
 * Reports progress via job.progress() and publishes status via Redis Pub/Sub.
 */
async function processOrder(job) {
    const data = job.data;
    const orderRepo = db_1.AppDataSource.getRepository(order_entity_1.Order);
    logger.info({ jobId: job.id, orderId: data.orderId }, 'Processing order');
    // Fetch or create order
    let order = await orderRepo.findOneBy({ id: data.orderId });
    if (!order) {
        order = orderRepo.create({
            id: data.orderId,
            orderType: data.orderType || 'market',
            tokenIn: data.tokenIn,
            tokenOut: data.tokenOut,
            amount: data.amount.toString(),
            slippage: data.slippage || 0,
            status: 'pending',
        });
        await orderRepo.save(order);
    }
    /**
     * Helper to update order status, report progress, and publish via Pub/Sub.
     */
    const updateOrderStatus = async (status, progress = 0, payload = {}) => {
        order.status = status;
        await orderRepo.save(order);
        // Report progress to BullMQ with full context
        // This triggers the 'progress' event which is listened to by QueueEvents
        try {
            await job.updateProgress({
                orderId: data.orderId,
                status,
                progress,
                message: payload.message || '',
                timestamp: new Date().toISOString(),
                ...payload,
            });
            logger.info({ orderId: data.orderId, status, progress }, '✅ Progress reported to BullMQ');
        }
        catch (err) {
            logger.error({ err }, '❌ Failed to update BullMQ job progress');
        }
        // Also publish via Pub/Sub for immediate delivery (backup)
        await publishOrderUpdate(order.id, status, {
            progress,
            ...payload,
        });
    };
    try {
        // Step 1: Routing - determine which DEX to use
        logger.info({ orderId: data.orderId }, 'Starting routing phase');
        await updateOrderStatus('routing', 10, {
            message: 'Fetching quotes from multiple DEXs...',
        });
        // Get quotes from both DEXs in parallel
        const amountNum = Number(data.amount);
        const dexes = ['raydium', 'meteora'];
        logger.debug({ dexes, amount: amountNum, orderId: data.orderId }, 'Fetching quotes');
        const quotes = await Promise.all(dexes.map((d) => (0, mockDexRouter_1.getQuote)(d, data.tokenIn, data.tokenOut, amountNum).catch((err) => {
            logger.warn({ dex: d, err, orderId: data.orderId }, 'Quote fetch failed');
            return { dex: d, amountOut: '0', error: String(err) };
        })));
        logger.debug({ orderId: data.orderId, quoteCount: quotes.length }, 'Quotes received');
        await updateOrderStatus('routing', 30, {
            message: `Received ${quotes.length} quotes`,
            quotesFetched: quotes.length,
        });
        // Select best quote
        const validQuotes = quotes.filter((q) => q.amountOut !== '0');
        if (validQuotes.length === 0) {
            throw new Error('No valid quotes received from any DEX');
        }
        const best = validQuotes.reduce((a, b) => Number(a.amountOut) > Number(b.amountOut) ? a : b);
        order.quotes = quotes;
        await orderRepo.save(order);
        logger.info({
            orderId: data.orderId,
            selectedDex: best.dex,
            quote: best,
        }, 'Best quote selected');
        // Step 2: Building - prepare transaction
        await updateOrderStatus('building', 50, {
            message: `Building transaction on ${best.dex}...`,
            chosenDex: best.dex,
            quote: best,
        });
        await (0, backoff_1.sleep)(500); // Simulate transaction building time
        await updateOrderStatus('building', 70, {
            message: 'Transaction built, ready to submit',
        });
        // Step 3: Submission - attempt execution with retries
        let attempt = 0;
        const maxAttempts = 3;
        while (attempt < maxAttempts) {
            attempt++;
            order.attempts = attempt;
            await orderRepo.save(order);
            const progressPerAttempt = Math.floor((70 + (30 / maxAttempts) * attempt));
            await updateOrderStatus('submitted', progressPerAttempt, {
                message: `Submitting transaction (attempt ${attempt}/${maxAttempts})...`,
                attempt,
                maxAttempts,
            });
            try {
                logger.info({ attempt, orderId: order.id, dex: best.dex }, 'Executing swap');
                const result = await (0, mockDexRouter_1.executeSwap)(best.dex, data.tokenIn, data.tokenOut, amountNum);
                // Success
                order.txHash = result.txHash;
                order.status = 'confirmed';
                await orderRepo.save(order);
                logger.info({ orderId: order.id, txHash: result.txHash, attempt }, 'Order confirmed');
                // Final success message
                await updateOrderStatus('confirmed', 100, {
                    message: 'Order successfully executed',
                    txHash: result.txHash,
                    dex: best.dex,
                });
                return {
                    success: true,
                    txHash: result.txHash,
                    dex: best.dex,
                    attempt,
                };
            }
            catch (err) {
                const isTransient = !!err?.transient;
                order.lastError = String(err?.message || err);
                await orderRepo.save(order);
                logger.warn({
                    attempt,
                    orderId: order.id,
                    err: order.lastError,
                    transient: isTransient,
                }, 'Execution attempt failed');
                // Publish failure with retry info
                await publishOrderUpdate(order.id, 'execution-failed', {
                    message: `Attempt ${attempt} failed: ${order.lastError}`,
                    attempt,
                    maxAttempts,
                    transient: isTransient,
                    retriesRemaining: maxAttempts - attempt,
                    error: order.lastError,
                });
                // If not transient or max attempts reached, fail permanently
                if (!isTransient || attempt >= maxAttempts) {
                    order.status = 'failed';
                    await orderRepo.save(order);
                    logger.error({
                        orderId: order.id,
                        error: order.lastError,
                        transient: isTransient,
                        finalAttempt: attempt >= maxAttempts,
                    }, 'Order failed permanently');
                    // Publish final failure
                    await updateOrderStatus('failed', 0, {
                        message: `Order processing failed: ${order.lastError}`,
                        final: true,
                        error: order.lastError,
                        totalAttempts: attempt,
                    });
                    return {
                        success: false,
                        error: order.lastError,
                        totalAttempts: attempt,
                    };
                }
                // Backoff before retry
                const delay = (0, backoff_1.exponentialBackoffMs)(attempt);
                logger.debug({ delay, nextAttempt: attempt + 1, orderId: order.id }, 'Backing off before retry');
                await publishOrderUpdate(order.id, 'retry-pending', {
                    message: `Retrying in ${delay}ms...`,
                    delay,
                    nextAttempt: attempt + 1,
                });
                await (0, backoff_1.sleep)(delay);
            }
        }
        // Fallback: should not reach here, but handle just in case
        order.status = 'failed';
        order.lastError = 'Max attempts exceeded';
        await orderRepo.save(order);
        await updateOrderStatus('failed', 0, {
            message: 'Max retry attempts exceeded',
            error: order.lastError,
            totalAttempts: attempt,
        });
        return {
            success: false,
            error: order.lastError,
            totalAttempts: attempt,
        };
    }
    catch (err) {
        logger.error({ orderId: data.orderId, err }, 'Unexpected error processing order');
        order.status = 'failed';
        order.lastError = String(err);
        await orderRepo.save(order);
        await updateOrderStatus('failed', 0, {
            message: `Unexpected error: ${order.lastError}`,
            final: true,
            error: order.lastError,
        });
        return {
            success: false,
            error: order.lastError,
            unexpected: true,
        };
    }
}
/**
 * Worker initialization and startup.
 * Only starts if this is the main module or START_WORKER is set.
 */
if (require.main === module || process.env.START_WORKER === 'true') {
    (async () => {
        try {
            // Initialize database first
            if (!db_1.AppDataSource.isInitialized) {
                await db_1.AppDataSource.initialize();
                logger.info('Database initialized');
            }
            // Verify Redis connection
            try {
                await index_1.redisConnection.ping();
                logger.info('Redis connection verified');
            }
            catch (err) {
                logger.error({ err }, 'Redis not available. Worker cannot start.');
                process.exit(1);
            }
            // Create worker
            const worker = new bullmq_1.Worker('orders', async (job) => {
                return processOrder(job);
            }, {
                connection: index_1.redisConnection,
                concurrency: 10,
            });
            // Worker event handlers
            worker.on('completed', (job, result) => {
                logger.info({ jobId: job?.id, orderId: job?.data?.orderId, result }, 'Job completed');
            });
            worker.on('failed', (job, err) => {
                logger.error({ jobId: job?.id, orderId: job?.data?.orderId, err }, 'Job failed');
            });
            worker.on('error', (err) => {
                logger.error({ err }, 'Worker error');
            });
            // Initialize Queue Events Manager for publishing BullMQ events
            logger.info('Initializing Queue Events Manager');
            const queueEventsManager = (0, queue_events_1.initializeQueueEventsManager)(index_1.redisConnection);
            const queue = (0, index_1.getOrderQueue)();
            queueEventsManager.attachToQueue(queue, 'orders');
            queueEventsManager.attachToWorker(worker, 'orders');
            logger.info('Queue Events Manager initialized and attached');
            // Graceful shutdown
            process.on('SIGTERM', async () => {
                logger.info('SIGTERM received, shutting down worker');
                await worker.close();
                await queueEventsManager.cleanup();
                await index_1.redisConnection.quit();
                process.exit(0);
            });
            process.on('SIGINT', async () => {
                logger.info('SIGINT received, shutting down worker');
                await worker.close();
                await queueEventsManager.cleanup();
                await index_1.redisConnection.quit();
                process.exit(0);
            });
            logger.info('Worker process started successfully');
        }
        catch (err) {
            logger.error({ err }, 'Failed to start worker');
            process.exit(1);
        }
    })();
}
