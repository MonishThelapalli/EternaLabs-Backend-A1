import WebSocket from 'ws';
import pino from 'pino';

const logger = pino();

export class WebSocketManager {
  private connections: Map<string, Set<WebSocket>> = new Map();

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

    this.sendToOrder(orderId, {
      type: 'connection',
      message: 'Connected to order status stream',
      orderId,
      timestamp: new Date().toISOString(),
    });

    ws.on('close', () => {
      this.unregister(orderId, ws);
    });

    ws.on('error', (err) => {
      logger.warn({ err, orderId }, 'WebSocket error');
      this.unregister(orderId, ws);
    });
  }

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

  public getClientCount(orderId: string): number {
    return this.connections.get(orderId)?.size ?? 0;
  }

  public getTotalClientCount(): number {
    let total = 0;
    this.connections.forEach((clients) => {
      total += clients.size;
    });
    return total;
  }

  public getConnectedOrderCount(): number {
    return this.connections.size;
  }

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

export const wsManager = new WebSocketManager();
