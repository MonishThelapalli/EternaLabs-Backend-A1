"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueEventsManager = void 0;
exports.initializeQueueEventsManager = initializeQueueEventsManager;
exports.getQueueEventsManager = getQueueEventsManager;
const ioredis_1 = __importDefault(require("ioredis"));
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)();
class QueueEventsManager {
    constructor(redisConnection) {
        this.eventListeners = new Map();
        this.redisConnection = redisConnection;
        this.publisher = new ioredis_1.default({
            host: redisConnection.options.host || '127.0.0.1',
            port: redisConnection.options.port || 6379,
            db: redisConnection.options.db || 0,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
        });
        this.publisher.on('error', (err) => {
            logger.error({ err }, 'QueueEventsManager publisher error');
        });
    }
    attachToQueue(queue, queueName = 'orders') {
        logger.info({ queueName }, 'Attaching queue listeners');
    }
    attachToWorker(worker, queueName = 'orders') {
        logger.info({ queueName }, 'Attaching worker event listeners');
        const onCompleted = (job, result, prev) => {
            this.publishJobEvent(job.id, job.data?.orderId, 'completed', {
                message: 'Job completed successfully',
                result,
            });
        };
        const onFailed = (job, err, prev) => {
            if (!job)
                return;
            this.publishJobEvent(job.id, job.data?.orderId, 'failed', {
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
    publishJobEvent(jobId, orderId, eventType, payload = {}) {
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
                }
                else if ((numSubscribers ?? 0) > 0) {
                    logger.debug({ orderId, eventType, subscribers: numSubscribers }, 'Job event published');
                }
            });
        }
        catch (err) {
            logger.error({ err }, 'Error publishing job event');
        }
    }
    async cleanup() {
        logger.info('Cleaning up QueueEventsManager');
        this.eventListeners.clear();
        await this.publisher.quit();
    }
}
exports.QueueEventsManager = QueueEventsManager;
let instance = null;
function initializeQueueEventsManager(redisConnection) {
    if (!instance) {
        instance = new QueueEventsManager(redisConnection);
    }
    return instance;
}
function getQueueEventsManager() {
    return instance;
}
