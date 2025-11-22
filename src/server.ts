import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import WebSocket from 'ws';
import bodyParser from 'body-parser';
import pino from 'pino';
import ordersRouter from './routes/orders';
import { AppDataSource } from './db';
import { redisConnection, getOrderQueue } from './queue';
import { initializeOrderQueueEvents } from './queue/orderEvents';
import { wsManager } from './services/websocket-manager';
import setupWebSocketRoutes, { createWebSocketUpgradeHandler } from './routes/ws.routes';

const logger = pino();
const app = express();

// Middleware
app.use(bodyParser.json());

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? undefined : err.message,
  });
});

// HTTP Server
const server = http.createServer(app);

// WebSocket Server
const wss = new WebSocket.Server({ noServer: true });

/**
 * Setup WebSocket routes for /ws/orders endpoint
 * Supports JSON-based subscription protocol: { "action": "subscribe", "orderId": "..." }
 */
setupWebSocketRoutes(wss);

/**
 * Handle HTTP upgrade requests for WebSocket connections.
 * Routes:
 * 1. /api/orders/status/:orderId - Original path-based subscription
 * 2. /ws/orders - New JSON-based subscription protocol
 */
server.on('upgrade', (request, socket, head) => {
  const { url = '' } = request;

  // Route 1: Original /api/orders/status/:orderId path
  if (url.startsWith('/api/orders/status/')) {
    logger.debug({ url }, 'Upgrading to WebSocket on /api/orders/status/:orderId');
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection-legacy', ws, request);
    });
  }
  // Route 2: New /ws/orders path with JSON-based subscription
  else if (url === '/ws/orders' || url.startsWith('/ws/orders?')) {
    logger.debug({ url }, 'Upgrading to WebSocket on /ws/orders');
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
  // Reject unknown upgrade paths
  else {
    logger.warn({ url }, 'Rejecting WebSocket upgrade for unknown path');
    socket.destroy();
  }
});

/**
 * Legacy WebSocket connection handler for /api/orders/status/:orderId path.
 * Maintains backward compatibility with the original subscription method.
 */
wss.on('connection-legacy', async (ws: WebSocket, request: http.IncomingMessage) => {
  const url = request.url || '';
  const orderId = url.split('/').pop();

  if (!orderId || !orderId.trim()) {
    logger.warn('WebSocket connection without valid orderId');
    ws.close(1008, 'Invalid order ID');
    return;
  }

  logger.info({ orderId, path: 'legacy' }, 'Legacy WebSocket client connecting');

  // Register the connection in the WebSocket manager
  wsManager.register(orderId, ws);

  // Create a dedicated subscriber for this WebSocket connection
  const subscriber = new (require('ioredis'))({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });

  const channel = `order:${orderId}`;

  subscriber.on('error', (err: Error) => {
    logger.debug({ err, orderId }, 'Subscriber error');
  });

  subscriber.on('close', () => {
    logger.debug({ orderId }, 'Subscriber connection closed');
  });

  /**
   * Subscribe to the order's status channel and forward messages to the WebSocket.
   */
  (async () => {
    try {
      await subscriber.connect();
      logger.debug({ orderId, channel }, 'Subscriber connected');

      // Subscribe and handle incoming messages
      await subscriber.subscribe(channel, (err: Error | null, count: number) => {
        if (err) {
          logger.error({ err, orderId, channel }, 'Subscribe error');
          ws.close(1011, 'Failed to subscribe to updates');
        } else {
          logger.debug({ orderId, channel, count }, 'Subscription established');
          // Send subscription confirmation
          wsManager.sendToOrder(orderId, {
            type: 'subscribed',
            orderId,
            message: `Subscribed to real-time updates for order ${orderId}`,
            timestamp: new Date().toISOString(),
          });
        }
      });

      // Listen for messages on the subscription
      subscriber.on('message', (chan: string, message: string) => {
        if (chan === channel && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(message);
          } catch (err) {
            logger.warn({ err, orderId }, 'Failed to send WebSocket message');
          }
        }
      });
    } catch (err) {
      logger.error({ err, orderId, channel }, 'Failed to subscribe to Redis channel');
      ws.close(1011, 'Internal server error');
    }
  })();

  /**
   * Handle WebSocket close event.
   * Clean up the Redis subscriber connection.
   */
  ws.on('close', () => {
    logger.debug({ orderId }, 'WebSocket client disconnected');
    subscriber.unsubscribe(channel);
    subscriber.disconnect();
    wsManager.unregister(orderId, ws);
  });

  /**
   * Handle any WebSocket errors.
   */
  ws.on('error', (err) => {
    logger.error({ err, orderId }, 'WebSocket error');
  });
});

/**
 * New JSON-based WebSocket connection handler for /ws/orders path.
 * Already handled by setupWebSocketRoutes() above.
 * This handler is intentionally left as a reference point.
 */

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

/**
 * Initialize and start the server.
 */
async function start() {
  try {
    // Initialize database
    logger.info('Initializing database...');
    await AppDataSource.initialize();
    logger.info('Database initialized successfully');

    // Verify Redis connection for queue operations
    try {
      await redisConnection.ping();
      logger.info('Redis connection verified for queue');
    } catch (err) {
      logger.error(
        { err },
        'Redis unavailable - queue operations will fail. Start Redis and restart the server.'
      );
      process.exit(1);
    }

    // Initialize Order Queue Events listener for real-time WebSocket updates
    logger.info('Initializing Order Queue Events listener...');
    initializeOrderQueueEvents();
    logger.info('Order Queue Events listener initialized and ready to forward progress events');

    // Register routes after database is initialized
    app.use('/api/orders', ordersRouter);

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        websocket: {
          connectedOrders: wsManager.getConnectedOrderCount(),
          totalClients: wsManager.getTotalClientCount(),
        },
      });
    });

    // Start HTTP server
    server.listen(PORT, () => {
      logger.info(`Server listening on http://localhost:${PORT}`);
      logger.info('Endpoints:');
      logger.info('  POST /api/orders/execute - Create and enqueue an order');
      logger.info('  GET /api/orders/status/:orderId - Get order status (REST)');
      logger.info('  WS /api/orders/status/:orderId - Real-time order updates (path-based)');
      logger.info('  WS /ws/orders - Real-time order updates (JSON-based subscription)');
      logger.info('  GET /health - Health check');
      logger.info('');
      logger.info('WebSocket Usage:');
      logger.info('  Method 1: wscat -c ws://localhost:3000/api/orders/status/<orderId>');
      logger.info('  Method 2: wscat -c ws://localhost:3000/ws/orders');
      logger.info('           Then send: {"action":"subscribe","orderId":"<orderId>"}');
    });
  } catch (err) {
    logger.error({ err }, 'Failed to initialize server');
    process.exit(1);
  }
}

/**
 * Graceful shutdown handlers.
 */
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  wsManager.closeAll();
  server.close(async () => {
    await AppDataSource.destroy();
    await redisConnection.quit();
    logger.info('Server shut down');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  wsManager.closeAll();
  server.close(async () => {
    await AppDataSource.destroy();
    await redisConnection.quit();
    logger.info('Server shut down');
    process.exit(0);
  });
});

// Start the server
start().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});