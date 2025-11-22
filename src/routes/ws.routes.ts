import WebSocket from 'ws';
import http from 'http';
import pino from 'pino';
import { wsManager } from '../services/websocket-manager';

const logger = pino();

/**
 * WebSocket Routes for Order Status Updates
 *
 * Endpoint: ws://localhost:3000/ws/orders
 *
 * Protocol:
 * 1. Connect to ws://localhost:3000/ws/orders
 * 2. Send: { "action": "subscribe", "orderId": "uuid" }
 * 3. Receive: Real-time order updates { "type": "routing", "status": "routing", "progress": 10, ... }
 *
 * This route provides:
 * - Alternative to /api/orders/status/:orderId upgrade path
 * - JSON-based subscription protocol
 * - Multiple order subscriptions per connection
 */

export function setupWebSocketRoutes(wss: WebSocket.Server) {
  /**
   * Handle new WebSocket connections on /ws/orders
   */
  wss.on('connection', (ws: WebSocket, request: http.IncomingMessage) => {
    const clientId = require('uuid').v4();
    const subscriptions = new Set<string>(); // Track which orders this client is subscribed to

    logger.info(
      { clientId, url: request.url, remoteAddress: request.socket.remoteAddress },
      'New WebSocket connection'
    );

    /**
     * Send a message to the WebSocket client.
     * Safely handles closed connections.
     */
    const send = (message: Record<string, any>) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(message));
          logger.debug(
            { clientId, messageType: message.type },
            'Message sent to client'
          );
        } catch (err) {
          logger.warn({ err, clientId }, 'Failed to send message to client');
        }
      }
    };

    /**
     * Send initial connection confirmation
     */
    send({
      type: 'connection',
      clientId,
      message: 'Connected to order WebSocket server',
      timestamp: new Date().toISOString(),
      instructions: {
        subscribe: { action: 'subscribe', orderId: 'your-order-id' },
        unsubscribe: { action: 'unsubscribe', orderId: 'your-order-id' },
      },
    });

    /**
     * Handle incoming messages
     */
    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        const { action, orderId } = message;

        logger.debug(
          { clientId, action, orderId },
          'WebSocket message received'
        );

        // Validate action
        if (!action) {
          send({
            type: 'error',
            error: 'Invalid message',
            details: 'action field is required',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // Handle subscribe action
        if (action === 'subscribe') {
          if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
            send({
              type: 'error',
              error: 'Invalid subscription',
              details: 'orderId is required and must be a non-empty string',
              timestamp: new Date().toISOString(),
            });
            return;
          }

          subscriptions.add(orderId);
          wsManager.register(orderId, ws);

          logger.info(
            { clientId, orderId, subscriptionCount: subscriptions.size },
            '✅ Client subscribed to order'
          );

          send({
            type: 'subscribed',
            orderId,
            clientId,
            message: `Subscribed to real-time updates for order ${orderId}`,
            timestamp: new Date().toISOString(),
          });
        }
        // Handle unsubscribe action
        else if (action === 'unsubscribe') {
          if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
            send({
              type: 'error',
              error: 'Invalid unsubscription',
              details: 'orderId is required and must be a non-empty string',
              timestamp: new Date().toISOString(),
            });
            return;
          }

          subscriptions.delete(orderId);
          wsManager.unregister(orderId, ws);

          logger.info(
            { clientId, orderId, subscriptionCount: subscriptions.size },
            '✅ Client unsubscribed from order'
          );

          send({
            type: 'unsubscribed',
            orderId,
            message: `Unsubscribed from order ${orderId}`,
            timestamp: new Date().toISOString(),
          });
        }
        // Handle unknown action
        else {
          send({
            type: 'error',
            error: 'Unknown action',
            details: `Action "${action}" is not supported. Use "subscribe" or "unsubscribe".`,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        logger.warn({ err, clientId }, 'Failed to parse WebSocket message');
        send({
          type: 'error',
          error: 'Invalid JSON',
          details: 'Message could not be parsed as JSON',
          timestamp: new Date().toISOString(),
        });
      }
    });

    /**
     * Handle WebSocket close
     */
    ws.on('close', (code: number, reason: string) => {
      logger.info(
        { clientId, code, reason, subscriptionCount: subscriptions.size },
        'WebSocket connection closed'
      );

      // Unregister from all subscriptions
      subscriptions.forEach((orderId) => {
        wsManager.unregister(orderId, ws);
      });
      subscriptions.clear();
    });

    /**
     * Handle WebSocket errors
     */
    ws.on('error', (err: Error) => {
      logger.error(
        { err, clientId, subscriptionCount: subscriptions.size },
        'WebSocket error'
      );
    });

    /**
     * Handle pong messages (keep-alive)
     */
    ws.on('pong', () => {
      logger.debug({ clientId }, 'Pong received from client');
    });
  });
}

/**
 * Middleware to handle WebSocket upgrade requests
 * Attach to Express server for /ws/orders path
 */
export function createWebSocketUpgradeHandler(wss: WebSocket.Server) {
  return (request: http.IncomingMessage, socket: any, head: Buffer) => {
    const url = request.url || '';

    // Only handle /ws/orders path
    if (url === '/ws/orders' || url.startsWith('/ws/orders?')) {
      logger.debug({ url }, 'Upgrading connection to WebSocket');
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      logger.warn({ url }, 'Upgrade request for unknown path, closing socket');
      socket.destroy();
    }
  };
}

export default setupWebSocketRoutes;
