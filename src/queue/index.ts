import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';

const logger = pino();

/**
 * BullMQ connection with proper settings for production.
 * maxRetriesPerRequest: null ensures connection pooling works correctly with BullMQ v4.
 */
export const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null, // Critical for BullMQ v4
  enableReadyCheck: false,
  lazyConnect: false,
});

// Redis event handlers
redisConnection.on('connect', () => {
  logger.info('Redis connection established for queue');
});

redisConnection.on('error', (err) => {
  logger.error({ err }, 'Redis connection error for queue');
});

redisConnection.on('ready', () => {
  logger.debug('Redis ready for queue');
});

redisConnection.on('close', () => {
  logger.warn('Redis connection closed for queue');
});

/**
 * Order queue instance using BullMQ.
 * Uses the same connection as above.
 */
export const orderQueue = new Queue('orders', {
  connection: redisConnection,
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
export async function enqueueOrder(data: {
  orderId: string;
  orderType?: string;
  tokenIn: string;
  tokenOut: string;
  amount: number;
  slippage?: number;
}) {
  try {
    const job = await orderQueue.add('execute-order', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 500,
      },
    });
    logger.info({ jobId: job.id, orderId: data.orderId }, 'Order enqueued');
    return job;
  } catch (err) {
    logger.error({ err, orderId: data.orderId }, 'Failed to enqueue order');
    throw err;
  }
}

/**
 * Get the Redis connection for external use (e.g., Pub/Sub, event listeners).
 */
export function getRedisConnection() {
  return redisConnection;
}

/**
 * Get the order queue for external use (e.g., event listeners).
 */
export function getOrderQueue() {
  return orderQueue;
}

/**
 * Gracefully close the queue and connection.
 */
export async function closeQueue() {
  try {
    await orderQueue.close();
    await redisConnection.quit();
    logger.info('Queue and Redis connection closed');
  } catch (err) {
    logger.error({ err }, 'Error closing queue and connection');
  }
}