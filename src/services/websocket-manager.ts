import WebSocket from 'ws';
import pino from 'pino';

const logger = pino();

/**
 * WebSocket Manager
 *
 * Maintains a registry of WebSocket connections keyed by orderId.
 * Provides methods to:
 * - Register new connections
 * - Send messages to specific orders
 * - Broadcast to all connections
 * - Clean up closed connections
 */
export class WebSocketManager {
  private connections: Map<string, Set<WebSocket>> = new Map();

  /**
   * Register a new WebSocket connection for an order.
   * Multiple clients can connect to the same order.
   */
  public register(orderId: string, ws: WebSocket): void {
    if (!this.connections.has(orderId)) {
      this.connections.set(orderId, new Set());
    }

    this.connections.get(orderId)!.add(ws);

    logger.debug(
      {
        orderId,
        clientCount: this.connections.get(orderId)!.size,
        totalOrders: this.connections.size,
      },
      'WebSocket client registered'
    );

    // Send connection acknowledgment
    this.sendToOrder(orderId, {
      type: 'connection',
      message: 'Connected to order status stream',
      orderId,
      timestamp: new Date().toISOString(),
    });

    // Setup cleanup on close
    ws.on('close', () => {
      this.unregister(orderId, ws);
    });

    ws.on('error', (err) => {
      logger.warn({ err, orderId }, 'WebSocket error');
      this.unregister(orderId, ws);
    });
  }

  /**
   * Unregister a WebSocket connection.
   * Cleans up the registry if no connections remain for the order.
   */
  public unregister(orderId: string, ws: WebSocket): void {
    const clients = this.connections.get(orderId);
    if (!clients) return;

    clients.delete(ws);

    if (clients.size === 0) {
      this.connections.delete(orderId);
      logger.debug({ orderId }, 'All WebSocket clients disconnected, removed order from registry');
    } else {
      logger.debug(
        { orderId, remainingClients: clients.size },
        'WebSocket client unregistered'
      );
    }
  }

  /**
   * Send a message to all WebSocket clients connected to a specific order.
   * Automatically handles connection state checks.
   */
  public sendToOrder(orderId: string, message: any): void {
    const clients = this.connections.get(orderId);
    if (!clients || clients.size === 0) {
      logger.trace({ orderId }, 'No clients connected for order');
      return;
    }

    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    let sentCount = 0;
    let failedCount = 0;

    clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(payload);
          sentCount++;
        } catch (err) {
          logger.warn({ err, orderId }, 'Failed to send WebSocket message');
          failedCount++;
        }
      }
    });

    if (sentCount > 0 || failedCount > 0) {
      logger.debug(
        { orderId, sent: sentCount, failed: failedCount },
        'Messages sent to order clients'
      );
    }
  }

  /**
   * Broadcast a message to all connected WebSocket clients across all orders.
   */
  public broadcast(message: any): void {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    let totalSent = 0;
    let totalFailed = 0;

    this.connections.forEach((clients, orderId) => {
      let sent = 0;
      let failed = 0;

      clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(payload);
            sent++;
            totalSent++;
          } catch (err) {
            logger.warn({ err, orderId }, 'Failed to broadcast message');
            failed++;
            totalFailed++;
          }
        }
      });
    });

    logger.debug(
      { totalSent, totalFailed, ordersWithClients: this.connections.size },
      'Broadcast complete'
    );
  }

  /**
   * Get count of connections for an order.
   */
  public getClientCount(orderId: string): number {
    return this.connections.get(orderId)?.size ?? 0;
  }

  /**
   * Get total number of connected clients across all orders.
   */
  public getTotalClientCount(): number {
    let total = 0;
    this.connections.forEach((clients) => {
      total += clients.size;
    });
    return total;
  }

  /**
   * Get total number of orders with connected clients.
   */
  public getConnectedOrderCount(): number {
    return this.connections.size;
  }

  /**
   * Close all connections and clear registry.
   * Used during graceful shutdown.
   */
  public closeAll(): void {
    let closedCount = 0;

    this.connections.forEach((clients, orderId) => {
      clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1001, 'Server shutting down');
          closedCount++;
        }
      });
    });

    this.connections.clear();
    logger.info({ closedCount }, 'All WebSocket connections closed');
  }
}

// Singleton instance
export const wsManager = new WebSocketManager();
