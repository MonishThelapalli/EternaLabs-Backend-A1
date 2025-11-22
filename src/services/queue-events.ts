import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';

const logger = pino();

/**
 * Queue Events Manager
 *
 * Listens to BullMQ job events and publishes them via Redis Pub/Sub
 * so that WebSocket clients can receive real-time updates.
 *
 * Events handled via Worker:
 * - completed
 * - failed
 *
 * Events handled via direct Pub/Sub in job processor:
 * - routing, building, submitted, confirmed
 */
export class QueueEventsManager {
  private publisher: IORedis;
  private redisConnection: IORedis;
  private eventListeners: Map<string, (...args: any[]) => void> = new Map();

  constructor(redisConnection: IORedis) {
    this.redisConnection = redisConnection;

    // Use a separate publisher connection to avoid blocking
    this.publisher = new IORedis({
      host: (redisConnection.options as any).host || '127.0.0.1',
      port: (redisConnection.options as any).port || 6379,
      db: (redisConnection.options as any).db || 0,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.publisher.on('error', (err) => {
      logger.error({ err }, 'QueueEventsManager publisher error');
    });
  }

  /**
   * Attach event listeners to a queue.
   * Since QueueEvents is complex with type issues, we mainly rely on Worker events.
   */
  public attachToQueue(queue: Queue, queueName: string = 'orders'): void {
    logger.info({ queueName }, 'Attaching queue listeners');
    // Queue events are primarily handled via Worker and job processor
  }

  /**
   * Attach event listeners to a worker.
   * Alternative approach: listen on the worker itself rather than the queue.
   * This is useful when worker and server are running separately.
   */
  public attachToWorker(worker: Worker, queueName: string = 'orders'): void {
    logger.info({ queueName }, 'Attaching worker event listeners');

    const onCompleted = (job: Job, result: any, prev?: string) => {
      this.publishJobEvent(job.id!, job.data?.orderId, 'completed', {
        message: 'Job completed successfully',
        result,
      });
    };

    const onFailed = (job: Job | undefined, err: Error, prev?: string) => {
      if (!job) return;
      this.publishJobEvent(job.id!, job.data?.orderId, 'failed', {
        message: `Job failed: ${err.message}`,
        error: err.message,
      });
    };

    this.eventListeners.set('worker:completed', onCompleted);
    this.eventListeners.set('worker:failed', onFailed);

    worker.on('completed', onCompleted);
    worker.on('failed', onFailed);

    logger.debug({ queueName }, 'Worker event listeners attached');
  }

  /**
   * Publish a job event to Redis Pub/Sub.
   * Extracts orderId from job data and publishes to order-specific channel.
   */
  private publishJobEvent(
    jobId: string,
    orderId: string | undefined,
    eventType: string,
    payload: Record<string, any> = {}
  ): void {
    try {
      if (!orderId) {
        logger.warn({ jobId }, 'Job has no orderId, cannot publish event');
        return;
      }

      const channel = `order:${orderId}`;
      const message = JSON.stringify({
        type: eventType,
        jobId,
        orderId,
        timestamp: new Date().toISOString(),
        ...payload,
      });

      this.publisher.publish(channel, message, (err, numSubscribers) => {
        if (err) {
          logger.error({ err, orderId, eventType }, 'Failed to publish job event');
        } else if ((numSubscribers ?? 0) > 0) {
          logger.debug(
            { orderId, eventType, subscribers: numSubscribers },
            'Job event published'
          );
        }
      });
    } catch (err) {
      logger.error({ err }, 'Error publishing job event');
    }
  }

  /**
   * Clean up resources.
   */
  public async cleanup(): Promise<void> {
    logger.info('Cleaning up QueueEventsManager');
    this.eventListeners.clear();
    await this.publisher.quit();
  }
}

// Singleton instance (initialized in server.ts)
let instance: QueueEventsManager | null = null;

export function initializeQueueEventsManager(redisConnection: IORedis): QueueEventsManager {
  if (!instance) {
    instance = new QueueEventsManager(redisConnection);
  }
  return instance;
}

export function getQueueEventsManager(): QueueEventsManager | null {
  return instance;
}
