import { QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';
import { wsManager } from '../services/websocket-manager';

const logger = pino();

let queueEventsInstance: QueueEvents | null = null;

export function initializeOrderQueueEvents(): QueueEvents {
  if (queueEventsInstance) {
    return queueEventsInstance;
  }

  const queueEvents = new QueueEvents('orders', {
    connection: {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    },
  });

  logger.info('Initializing Order Queue Events listener');

  queueEvents.on('progress', (args: any) => {
    try {
      const jobId = args.jobId;
      const progressData = args.data;

      logger.info({ jobId, progressData }, '🔥 PROGRESS EVENT RECEIVED');

      if (progressData && typeof progressData === 'object' && 'orderId' in progressData) {
        const { orderId, status, progress, message } = progressData;

        logger.info({ jobId, orderId, status, progress }, '✅ Progress event received and forwarding to WebSocket');

        wsManager.sendToOrder(orderId, {
          type: status,
          orderId,
          status,
          progress: progress || 0,
          message: message || '',
          timestamp: new Date().toISOString(),
          ...progressData,
        });
      } else {
        logger.warn({ jobId, progressData }, 'Progress event missing orderId');
      }
    } catch (err) {
      logger.error({ err }, 'Error handling progress event');
    }
  });

  queueEvents.on('completed', (args: any) => {
    try {
      const jobId = args.jobId;

      logger.debug({ jobId }, 'Job completed event received');
    } catch (err) {
      logger.error({ err }, 'Error handling completion event');
    }
  });

  queueEvents.on('failed', (args: any) => {
    try {
      const jobId = args.jobId;
      const failedReason = args.failedReason;

      logger.debug({ jobId, failedReason }, 'Job failed event received');
    } catch (err) {
      logger.error({ err }, 'Error handling failed event');
    }
  });

  queueEvents.on('error', (err: any) => {
    logger.error({ err }, 'Queue Events error');
  });

  queueEventsInstance = queueEvents;
  logger.info('Order Queue Events listener initialized');

  return queueEventsInstance;
}

export function getOrderQueueEvents(): QueueEvents | null {
  return queueEventsInstance;
}

export async function closeOrderQueueEvents(): Promise<void> {
  if (queueEventsInstance) {
    logger.info('Closing Order Queue Events listener');
    await queueEventsInstance.close();
    queueEventsInstance = null;
  }
}
