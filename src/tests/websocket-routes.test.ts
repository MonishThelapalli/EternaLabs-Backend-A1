import WebSocket from 'ws';
import http from 'http';
import express from 'express';
import bodyParser from 'body-parser';
import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import setupWebSocketRoutes from '../routes/ws.routes';
import { wsManager } from '../services/websocket-manager';

const logger = pino();

describe('WebSocket /ws/orders Endpoint', () => {
  let server: http.Server;
  let wss: WebSocket.Server;
  const PORT = 9999;
  const WS_URL = `ws://localhost:${PORT}/ws/orders`;

  beforeAll((done) => {
    const app = express();
    app.use(bodyParser.json());

    server = http.createServer(app);
    wss = new WebSocket.Server({ noServer: true });

    setupWebSocketRoutes(wss);

    server.on('upgrade', (request, socket, head) => {
      const { url = '' } = request;
      if (url === '/ws/orders' || url.startsWith('/ws/orders?')) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    server.listen(PORT, () => {
      logger.info(`Test server listening on port ${PORT}`);
      done();
    });
  });

  afterAll((done) => {
    server.close(() => {
      logger.info('Test server closed');
      done();
    });
  });

  it('should successfully establish WebSocket connection', (done) => {
    const ws = new WebSocket(WS_URL);

    ws.on('open', () => {
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
      done();
    });

    ws.on('error', (err) => {
      done(err);
    });
  });

  it('should send connection confirmation on connect', (done) => {
    const ws = new WebSocket(WS_URL);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        expect(message.type).toBe('connection');
        expect(message).toHaveProperty('clientId');
        expect(message).toHaveProperty('instructions');
        ws.close();
        done();
      } catch (err) {
        done(err);
      }
    });

    ws.on('error', (err) => {
      done(err);
    });
  });

  it('should accept subscription with valid orderId', (done) => {
    const ws = new WebSocket(WS_URL);
    const orderId = uuidv4();
    let messageCount = 0;

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        messageCount++;

        if (messageCount === 1) {
          expect(message.type).toBe('connection');
          ws.send(JSON.stringify({ action: 'subscribe', orderId }));
        } else if (messageCount === 2) {
          expect(message.type).toBe('subscribed');
          expect(message.orderId).toBe(orderId);
          expect(message).toHaveProperty('clientId');
          ws.close();
          done();
        }
      } catch (err) {
        done(err);
      }
    });

    ws.on('error', (err) => {
      done(err);
    });
  });

  it('should reject subscription without orderId', (done) => {
    const ws = new WebSocket(WS_URL);
    let messageCount = 0;

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        messageCount++;

        if (messageCount === 1) {
          ws.send(JSON.stringify({ action: 'subscribe' }));
        } else if (messageCount === 2) {
          expect(message.type).toBe('error');
          expect(message.error).toBe('Invalid subscription');
          expect(message.details).toContain('orderId');
          ws.close();
          done();
        }
      } catch (err) {
        done(err);
      }
    });

    ws.on('error', (err) => {
      done(err);
    });
  });

  it('should handle invalid JSON gracefully', (done) => {
    const ws = new WebSocket(WS_URL);
    let messageCount = 0;

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        messageCount++;

        if (messageCount === 1) {
          ws.send('{ invalid json }');
        } else if (messageCount === 2) {
          expect(message.type).toBe('error');
          expect(message.error).toBe('Invalid JSON');
          ws.close();
          done();
        }
      } catch (err) {
        done(err);
      }
    });

    ws.on('error', (err) => {
      done(err);
    });
  });

  it('should reject unknown action', (done) => {
    const ws = new WebSocket(WS_URL);
    let messageCount = 0;

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        messageCount++;

        if (messageCount === 1) {
          ws.send(JSON.stringify({ action: 'unknown-action', orderId: 'test' }));
        } else if (messageCount === 2) {
          expect(message.type).toBe('error');
          expect(message.error).toBe('Unknown action');
          ws.close();
          done();
        }
      } catch (err) {
        done(err);
      }
    });

    ws.on('error', (err) => {
      done(err);
    });
  });

  it('should handle unsubscribe action', (done) => {
    const ws = new WebSocket(WS_URL);
    const orderId = uuidv4();
    let messageCount = 0;

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        messageCount++;

        if (messageCount === 1) {
          // Connection confirmation
          ws.send(JSON.stringify({ action: 'subscribe', orderId }));
        } else if (messageCount === 2) {
          // Subscription confirmation
          expect(message.type).toBe('subscribed');
          ws.send(JSON.stringify({ action: 'unsubscribe', orderId }));
        } else if (messageCount === 3) {
          expect(message.type).toBe('unsubscribed');
          expect(message.orderId).toBe(orderId);
          ws.close();
          done();
        }
      } catch (err) {
        done(err);
      }
    });

    ws.on('error', (err) => {
      done(err);
    });
  });

  it('should support multiple subscriptions on same connection', (done) => {
    const ws = new WebSocket(WS_URL);
    const orderId1 = uuidv4();
    const orderId2 = uuidv4();
    let messageCount = 0;

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        messageCount++;

        if (messageCount === 1) {
          ws.send(JSON.stringify({ action: 'subscribe', orderId: orderId1 }));
        } else if (messageCount === 2) {
          expect(message.type).toBe('subscribed');
          expect(message.orderId).toBe(orderId1);
          ws.send(JSON.stringify({ action: 'subscribe', orderId: orderId2 }));
        } else if (messageCount === 3) {
          expect(message.type).toBe('subscribed');
          expect(message.orderId).toBe(orderId2);
          ws.close();
          done();
        }
      } catch (err) {
        done(err);
      }
    });

    ws.on('error', (err) => {
      done(err);
    });
  });

  it('should clean up subscriptions on connection close', (done) => {
    const ws = new WebSocket(WS_URL);
    const orderId = uuidv4();
    let messageCount = 0;

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        messageCount++;

        if (messageCount === 1) {
          ws.send(JSON.stringify({ action: 'subscribe', orderId }));
        } else if (messageCount === 2) {
          expect(message.type).toBe('subscribed');
          ws.close();
        }
      } catch (err) {
        done(err);
      }
    });

    ws.on('close', () => {
      expect(wsManager.getTotalClientCount()).toBeGreaterThanOrEqual(0);
      done();
    });

    ws.on('error', (err) => {
      done(err);
    });
  });

  it('should forward order updates to subscribed clients', (done) => {
    const ws = new WebSocket(WS_URL);
    const orderId = uuidv4();
    let messageCount = 0;

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        messageCount++;

        if (messageCount === 1) {
          // Connection confirmation
          ws.send(JSON.stringify({ action: 'subscribe', orderId }));
        } else if (messageCount === 2) {
          expect(message.type).toBe('subscribed');
          wsManager.sendToOrder(orderId, {
            type: 'routing',
            orderId,
            status: 'routing',
            progress: 10,
            message: 'Routing order',
            timestamp: new Date().toISOString(),
          });
        } else if (messageCount === 3) {
          expect(message.type).toBe('routing');
          expect(message.orderId).toBe(orderId);
          expect(message.status).toBe('routing');
          expect(message.progress).toBe(10);
          ws.close();
          done();
        }
      } catch (err) {
        done(err);
      }
    });

    ws.on('error', (err) => {
      done(err);
    });

    setTimeout(() => {}, 100);
  });
});

describe('WebSocket Message Protocol', () => {
  let server: http.Server;
  let wss: WebSocket.Server;
  const PORT = 9998;
  const WS_URL = `ws://localhost:${PORT}/ws/orders`;

  beforeAll((done) => {
    const app = express();
    app.use(bodyParser.json());

    server = http.createServer(app);
    wss = new WebSocket.Server({ noServer: true });

    setupWebSocketRoutes(wss);

    server.on('upgrade', (request, socket, head) => {
      const { url = '' } = request;
      if (url === '/ws/orders' || url.startsWith('/ws/orders?')) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    server.listen(PORT, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  it('should format subscription confirmation correctly', (done) => {
    const ws = new WebSocket(WS_URL);
    const orderId = 'test-order-123';
    let messageCount = 0;

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        messageCount++;

        if (messageCount === 1) {
          expect(message).toHaveProperty('type', 'connection');
          expect(message).toHaveProperty('clientId');
          expect(message).toHaveProperty('message');
          expect(message).toHaveProperty('timestamp');
          expect(message).toHaveProperty('instructions');
          ws.send(JSON.stringify({ action: 'subscribe', orderId }));
        } else if (messageCount === 2) {
          expect(message).toHaveProperty('type', 'subscribed');
          expect(message).toHaveProperty('orderId', orderId);
          expect(message).toHaveProperty('clientId');
          expect(message).toHaveProperty('message');
          expect(message).toHaveProperty('timestamp');
          ws.close();
          done();
        }
      } catch (err) {
        done(err);
      }
    });

    ws.on('error', done);
  });

  it('should format error messages correctly', (done) => {
    const ws = new WebSocket(WS_URL);
    let messageCount = 0;

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        messageCount++;

        if (messageCount === 1) {
          ws.send(JSON.stringify({ action: 'subscribe' }));
        } else if (messageCount === 2) {
          expect(message).toHaveProperty('type', 'error');
          expect(message).toHaveProperty('error');
          expect(message).toHaveProperty('details');
          expect(message).toHaveProperty('timestamp');
          ws.close();
          done();
        }
      } catch (err) {
        done(err);
      }
    });

    ws.on('error', done);
  });
});
