import IORedis from 'ioredis';
import pino from 'pino';

const logger = pino();

interface PubSubCallback {
  (message: string): void;
}

interface InMemorySubscriber {
  isConnected: boolean;
  subscribe(channel: string, callback: PubSubCallback): Promise<void>;
  publish(channel: string, message: string): Promise<number>;
  disconnect(): Promise<void>;
  on(event: string, callback: (...args: any[]) => void): void;
}

class InMemoryPubSub implements InMemorySubscriber {
  private subscriptions: Map<string, Set<PubSubCallback>> = new Map();
  private eventListeners: Map<string, Set<(...args: any[]) => void>> = new Map();
  public isConnected = true;

  async subscribe(channel: string, callback: PubSubCallback): Promise<void> {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel)!.add(callback);
    logger.debug(`[InMemory] Subscribed to channel: ${channel}`);
  }

  async publish(channel: string, message: string): Promise<number> {
    const subscribers = this.subscriptions.get(channel);
    if (!subscribers || subscribers.size === 0) {
      return 0;
    }

    subscribers.forEach((callback) => {
      try {
        callback(message);
      } catch (err) {
        logger.error({ err, channel }, '[InMemory] Error calling subscriber');
      }
    });

    return subscribers.size;
  }

  async disconnect(): Promise<void> {
    this.subscriptions.clear();
    logger.debug('[InMemory] Disconnected');
  }

  on(event: string, callback: (...args: any[]) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  private emit(event: string, ...args: any[]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(...args);
        } catch (err) {
          logger.error({ err, event }, '[InMemory] Error in event listener');
        }
      });
    }
  }
}

export async function createRedisClient(options: {
  host?: string;
  port?: number;
  lazyConnect?: boolean;
} = {}): Promise<IORedis | InMemoryPubSub> {
  const host = options.host || process.env.REDIS_HOST || '127.0.0.1';
  const port = options.port || parseInt(process.env.REDIS_PORT || '6379', 10);
  const lazyConnect = options.lazyConnect ?? false;

  if (process.env.REDIS_DISABLED === 'true') {
    logger.info('Redis is disabled. Using in-memory pub/sub.');
    return new InMemoryPubSub();
  }

  const redis = new IORedis({
    host,
    port,
    lazyConnect,
    retryStrategy: () => null, // Disable retries to fail fast
    enableReadyCheck: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
  });

  redis.on('error', (err) => {
    logger.debug({ err }, 'Redis connection error (will use in-memory fallback)');
  });

  if (!lazyConnect) {
    try {
      await Promise.race([
        redis.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Redis ping timeout')), 3000)
        ),
      ]);
      logger.info(`Connected to Redis at ${host}:${port}`);
      return redis;
    } catch (err) {
      logger.warn(
        { err: String(err) },
        `Could not connect to Redis at ${host}:${port}. Using in-memory pub/sub.`
      );
      redis.disconnect();
      return new InMemoryPubSub();
    }
  }

  redis.once('connect', () => {
    logger.info(`Connected to Redis at ${host}:${port}`);
  });

  redis.once('error', () => {
    logger.warn(
      `Could not connect to Redis at ${host}:${port}. Switching to in-memory pub/sub.`
    );
  });

  return redis;
}

export async function createQueueConnection(options: {
  host?: string;
  port?: number;
} = {}): Promise<IORedis | InMemoryPubSub> {
  const host = options.host || process.env.REDIS_HOST || '127.0.0.1';
  const port = options.port || parseInt(process.env.REDIS_PORT || '6379', 10);

  if (process.env.REDIS_DISABLED === 'true') {
    logger.info('Redis is disabled. Queue will use in-memory storage.');
    return new InMemoryPubSub();
  }

  const redis = new IORedis({
    host,
    port,
    retryStrategy: () => null,
    enableReadyCheck: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
  });

  try {
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Redis ping timeout')), 3000)
      ),
    ]);
    logger.info(`Queue connected to Redis at ${host}:${port}`);
    return redis;
  } catch (err) {
    logger.warn(
      { err: String(err) },
      `Queue: Could not connect to Redis at ${host}:${port}`
    );
    redis.disconnect();
    logger.warn('Queue operations will be limited. Redis is required for full queue functionality.');
    return new InMemoryPubSub();
  }
}

export { InMemoryPubSub };
