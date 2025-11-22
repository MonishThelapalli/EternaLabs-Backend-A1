import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';
import { AppDataSource } from '../db';
import { Order } from '../models/order.entity';
import { getQuote, executeSwap, DexName } from '../services/mockDexRouter';
import { exponentialBackoffMs, sleep } from '../utils/backoff';
import { redisConnection, orderQueue, getOrderQueue } from './index';
import { initializeQueueEventsManager } from '../services/queue-events';

const logger = pino();

const publisher = redisConnection;

export async function publishOrderUpdate(
  orderId: string,
  type: string,
  payload: Record<string, any> = {}
) {
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
  } catch (err) {
    logger.warn({ err, orderId }, 'Failed to publish order update');
  }
}

export async function processOrder(job: Job<{
  orderId: string;
  orderType?: string;
  tokenIn: string;
  tokenOut: string;
  amount: number;
  slippage?: number;
}>) {
  const data = job.data;
  const orderRepo = AppDataSource.getRepository(Order);

  logger.info({ jobId: job.id, orderId: data.orderId }, 'Processing order');

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

  const updateOrderStatus = async (
    status: string,
    progress: number = 0,
    payload: Record<string, any> = {}
  ) => {
    order.status = status as any;
    await orderRepo.save(order);

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
    } catch (err) {
      logger.error({ err }, '❌ Failed to update BullMQ job progress');
    }

    await publishOrderUpdate(order.id, status, {
      progress,
      ...payload,
    });
  };

  try {
    logger.info({ orderId: data.orderId }, 'Starting routing phase');
    await updateOrderStatus('routing', 10, {
      message: 'Fetching quotes from multiple DEXs...',
    });

    const amountNum = Number(data.amount);
    const dexes: DexName[] = ['raydium', 'meteora'];

    logger.debug({ dexes, amount: amountNum, orderId: data.orderId }, 'Fetching quotes');
    const quotes = await Promise.all(
      dexes.map((d) =>
        getQuote(d, data.tokenIn, data.tokenOut, amountNum).catch((err) => {
          logger.warn({ dex: d, err, orderId: data.orderId }, 'Quote fetch failed');
          return { dex: d, amountOut: '0', error: String(err) };
        })
      )
    );

    logger.debug({ orderId: data.orderId, quoteCount: quotes.length }, 'Quotes received');
    await updateOrderStatus('routing', 30, {
      message: `Received ${quotes.length} quotes`,
      quotesFetched: quotes.length,
    });

    const validQuotes = quotes.filter((q) => q.amountOut !== '0');
    if (validQuotes.length === 0) {
      throw new Error('No valid quotes received from any DEX');
    }

    const best = validQuotes.reduce((a, b) =>
      Number(a.amountOut) > Number(b.amountOut) ? a : b
    );

    order.quotes = quotes;
    await orderRepo.save(order);

    logger.info(
      {
        orderId: data.orderId,
        selectedDex: best.dex,
        quote: best,
      },
      'Best quote selected'
    );

    await updateOrderStatus('building', 50, {
      message: `Building transaction on ${best.dex}...`,
      chosenDex: best.dex,
      quote: best,
    });

    await sleep(500);

    await updateOrderStatus('building', 70, {
      message: 'Transaction built, ready to submit',
    });

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
        logger.info(
          { attempt, orderId: order.id, dex: best.dex },
          'Executing swap'
        );

        const result = await executeSwap(
          best.dex,
          data.tokenIn,
          data.tokenOut,
          amountNum
        );

        order.txHash = result.txHash;
        order.status = 'confirmed';
        await orderRepo.save(order);

        logger.info(
          { orderId: order.id, txHash: result.txHash, attempt },
          'Order confirmed'
        );

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
      } catch (err: any) {
        const isTransient = !!err?.transient;
        order.lastError = String(err?.message || err);
        await orderRepo.save(order);

        logger.warn(
          {
            attempt,
            orderId: order.id,
            err: order.lastError,
            transient: isTransient,
          },
          'Execution attempt failed'
        );

        await publishOrderUpdate(order.id, 'execution-failed', {
          message: `Attempt ${attempt} failed: ${order.lastError}`,
          attempt,
          maxAttempts,
          transient: isTransient,
          retriesRemaining: maxAttempts - attempt,
          error: order.lastError,
        });

        if (!isTransient || attempt >= maxAttempts) {
          order.status = 'failed';
          await orderRepo.save(order);

          logger.error(
            {
              orderId: order.id,
              error: order.lastError,
              transient: isTransient,
              finalAttempt: attempt >= maxAttempts,
            },
            'Order failed permanently'
          );

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

        const delay = exponentialBackoffMs(attempt);
        logger.debug(
          { delay, nextAttempt: attempt + 1, orderId: order.id },
          'Backing off before retry'
        );

        await publishOrderUpdate(order.id, 'retry-pending', {
          message: `Retrying in ${delay}ms...`,
          delay,
          nextAttempt: attempt + 1,
        });

        await sleep(delay);
      }
    }

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
  } catch (err) {
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

if (require.main === module || process.env.START_WORKER === 'true') {
  (async () => {
    try {
      if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
        logger.info('Database initialized');
      }

      try {
        await redisConnection.ping();
        logger.info('Redis connection verified');
      } catch (err) {
        logger.error({ err }, 'Redis not available. Worker cannot start.');
        process.exit(1);
      }

      const worker = new Worker(
        'orders',
        async (job: Job) => {
          return processOrder(job);
        },
        {
          connection: redisConnection,
          concurrency: 10,
        }
      );

      worker.on('completed', (job, result) => {
        logger.info(
          { jobId: job?.id, orderId: job?.data?.orderId, result },
          'Job completed'
        );
      });

      worker.on('failed', (job, err) => {
        logger.error(
          { jobId: job?.id, orderId: job?.data?.orderId, err },
          'Job failed'
        );
      });

      worker.on('error', (err) => {
        logger.error({ err }, 'Worker error');
      });

      logger.info('Initializing Queue Events Manager');
      const queueEventsManager = initializeQueueEventsManager(redisConnection);
      const queue = getOrderQueue();
      queueEventsManager.attachToQueue(queue, 'orders');
      queueEventsManager.attachToWorker(worker, 'orders');
      logger.info('Queue Events Manager initialized and attached');

      process.on('SIGTERM', async () => {
        logger.info('SIGTERM received, shutting down worker');
        await worker.close();
        await queueEventsManager.cleanup();
        await redisConnection.quit();
        process.exit(0);
      });

      process.on('SIGINT', async () => {
        logger.info('SIGINT received, shutting down worker');
        await worker.close();
        await queueEventsManager.cleanup();
        await redisConnection.quit();
        process.exit(0);
      });

      logger.info('Worker process started successfully');
    } catch (err) {
      logger.error({ err }, 'Failed to start worker');
      process.exit(1);
    }
  })();
}