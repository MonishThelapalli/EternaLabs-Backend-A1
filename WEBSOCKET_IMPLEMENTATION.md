# WebSocket Order Status Streaming - Complete Implementation

## Overview

This document explains the complete real-time WebSocket order status streaming system with all components integrated.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT APPLICATION                        │
│  (Browser WebSocket Client / Postman / Custom Client)            │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ HTTP POST /api/orders/execute
                 │ ↓
┌─────────────────────────────────────────────────────────────────┐
│                    REST SERVER (Express)                         │
│  - Creates order in database                                     │
│  - Enqueues job in BullMQ                                        │
│  - Returns orderId + WebSocket URL                               │
└────┬──────────────────────────────────────────────┬──────────────┘
     │                                              │
     │ HTTP Upgrade: GET /api/orders/status/:id    │ Job: orders queue
     │ Connection: Upgrade (WebSocket)              │ (Redis/BullMQ)
     │                                              │
     ↓                                              ↓
┌──────────────────────────────┐        ┌──────────────────────────┐
│   WebSocket Manager          │        │  Queue Worker Process    │
│  (connection registry)       │        │  - Processes jobs        │
│  - Registers orderId→ws      │        │  - Publishes progress    │
│  - Sends connection ACK      │        │  - On success/fail: done │
│  - Broadcasts messages       │        └──────────────┬───────────┘
└──────────┬───────────────────┘                       │
           │                                            │ Pub/Sub publish
           │ Redis Pub/Sub subscription                │ order:orderId
           │ channel: order:orderId                    │
           ↓                                            │
┌──────────────────────────────────────────────────────↓──────────┐
│              REDIS (Pub/Sub for real-time updates)              │
│  - Channels: order:{orderId}                                    │
│  - Messages: {type, orderId, status, progress, ...}             │
└───────────────────────────────────────────────────────────────────┘
```

## Component Breakdown

### 1. WebSocket Manager (`src/services/websocket-manager.ts`)

**Purpose:** Maintains registry of active WebSocket connections and broadcasts messages.

**Key Functions:**
- `register(orderId, ws)` - Register new WebSocket client for an order
- `unregister(orderId, ws)` - Cleanup closed connections
- `sendToOrder(orderId, message)` - Broadcast to all clients for an order
- `broadcast(message)` - Broadcast to all clients globally

**Flow:**
1. When WebSocket client connects to `/api/orders/status/:orderId`
2. Server calls `wsManager.register(orderId, ws)`
3. Manager sends initial connection ACK message
4. When Redis publishes messages to `order:orderId` channel
5. Server receives them and sends to all registered clients

### 2. Queue Events Manager (`src/services/queue-events.ts`)

**Purpose:** Listens to BullMQ job events and publishes them via Redis Pub/Sub.

**Key Functions:**
- `attachToQueue(queue, queueName)` - Attach listeners to queue
- `attachToWorker(worker, queueName)` - Attach listeners to worker
- `publishJobEvent(jobId, orderId, type, payload)` - Publish events

**Events Handled:**
- Worker `completed` → Published as `completed` event
- Worker `failed` → Published as `failed` event
- Job processor publishes intermediate events:
  - `routing`, `building`, `submitted`, `confirmed` via direct Pub/Sub

### 3. Queue Worker (`src/queue/worker.ts`)

**Purpose:** Processes orders and sends real-time progress updates.

**Key Exports:**
- `processOrder(job)` - Main job processor
- `publishOrderUpdate(orderId, type, payload)` - Helper for Pub/Sub

**Progress Events:**
1. **routing** (10%) → Fetching quotes
2. **routing** (30%) → Quotes received
3. **building** (50%) → Building transaction
4. **building** (70%) → Transaction ready
5. **submitted** (75-90%) → Submitting (per attempt)
6. **execution-failed** → Retry logic
7. **retry-pending** → Waiting before retry
8. **confirmed** (100%) → Success with txHash
9. **failed** (0%) → Final failure

### 4. Server (`src/server.ts`)

**Initialization:**
```typescript
// 1. Initialize database
// 2. Verify Redis connection
// 3. Initialize QueueEventsManager
// 4. Register routes
// 5. Start HTTP server with WebSocket upgrade handling
```

**WebSocket Upgrade Handler:**
- Detects HTTP upgrade requests for `/api/orders/status/*`
- Extracts orderId from URL
- Registers with WebSocketManager
- Subscribes to Redis Pub/Sub channel
- Forwards all messages to client
- Cleans up on close

## Real-Time Message Flow

### Step-by-Step Example

**1. Client creates order:**
```bash
POST http://localhost:3000/api/orders/execute
{
  "tokenIn": "SOL",
  "tokenOut": "USDC",
  "amount": 10
}
```

**Response:**
```json
{
  "success": true,
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "jobId": "1",
  "status": "pending",
  "wsUrl": "ws://localhost:3000/api/orders/status/550e8400-e29b-41d4-a716-446655440000"
}
```

**2. Client upgrades to WebSocket:**
```
GET /api/orders/status/550e8400-e29b-41d4-a716-446655440000 HTTP/1.1
Upgrade: websocket
Connection: Upgrade
```

**3. Server receives messages in real-time:**

```javascript
// Connection established
{
  "type": "connection",
  "message": "Connected to order status stream",
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-11-21T10:30:00Z"
}

// Subscription confirmed
{
  "type": "subscribed",
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Subscribed to real-time updates for order...",
  "timestamp": "2025-11-21T10:30:00Z"
}

// Routing phase
{
  "type": "routing",
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "progress": 10,
  "message": "Fetching quotes from multiple DEXs...",
  "timestamp": "2025-11-21T10:30:01Z"
}

{
  "type": "routing",
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "progress": 30,
  "message": "Received 2 quotes",
  "quotesFetched": 2,
  "timestamp": "2025-11-21T10:30:02Z"
}

// Building phase
{
  "type": "building",
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "progress": 50,
  "message": "Building transaction on raydium...",
  "chosenDex": "raydium",
  "quote": {
    "dex": "raydium",
    "amountOut": "25000000",
    "amountOutDecimal": "25.0"
  },
  "timestamp": "2025-11-21T10:30:03Z"
}

{
  "type": "building",
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "progress": 70,
  "message": "Transaction built, ready to submit",
  "timestamp": "2025-11-21T10:30:04Z"
}

// Submission phase
{
  "type": "submitted",
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "progress": 80,
  "message": "Submitting transaction (attempt 1/3)...",
  "attempt": 1,
  "maxAttempts": 3,
  "timestamp": "2025-11-21T10:30:05Z"
}

// Success
{
  "type": "confirmed",
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "progress": 100,
  "message": "Order successfully executed",
  "txHash": "5Jtmhqjc5v9KVCqJxVbL4Xj5Z5Z5Z5Z5Z5Z5Z5Z5Z",
  "dex": "raydium",
  "timestamp": "2025-11-21T10:30:06Z"
}
```

## Postman Testing

### Step 1: Create Order (REST)

**Request:**
```
POST http://localhost:3000/api/orders/execute
Content-Type: application/json

{
  "tokenIn": "SOL",
  "tokenOut": "USDC",
  "amount": 10,
  "slippage": 0.5
}
```

**Response:**
```json
{
  "success": true,
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "jobId": "1",
  "status": "pending",
  "message": "Order created and enqueued for processing",
  "wsUrl": "ws://localhost:3000/api/orders/status/550e8400-e29b-41d4-a716-446655440000"
}
```

**Copy the `orderId` for next step.**

### Step 2: Connect WebSocket

In Postman:
1. New Request → WebSocket
2. URL: `ws://localhost:3000/api/orders/status/{orderId}`
3. Click "Connect"
4. Watch for real-time messages

**You will see:**
- Connection acknowledgment
- Subscription confirmation
- Progress updates (routing → building → submitted → confirmed)
- Final status with txHash

### Example cURL for REST Status Check

```bash
# Get current order status (REST)
curl -X GET http://localhost:3000/api/orders/status/550e8400-e29b-41d4-a716-446655440000

# Response:
{
  "success": true,
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "orderType": "market",
  "tokenIn": "SOL",
  "tokenOut": "USDC",
  "amount": "10",
  "slippage": 0.5,
  "status": "confirmed",
  "txHash": "5Jtmhqjc5v9KVCqJxVbL4Xj5Z5Z5Z5Z5Z5Z5Z5Z5Z",
  "quotes": [...],
  "attempts": 1,
  "lastError": null,
  "createdAt": "2025-11-21T10:30:00Z",
  "updatedAt": "2025-11-21T10:30:06Z"
}
```

## Running the System

### Prerequisites
- Node.js 16+
- Redis server running on localhost:6379
- SQLite (dev) or PostgreSQL (prod)

### Start Server
```bash
npm run dev
# or
npm run build && npm start
```

Expected output:
```
Server listening on http://localhost:3000
Endpoints:
  POST /api/orders/execute - Create and enqueue an order
  GET /api/orders/status/:orderId - Get order status (REST)
  WS /api/orders/status/:orderId - Real-time order updates (WebSocket upgrade)
  GET /health - Health check
```

### Start Worker (Separate Process)
```bash
npm run worker
# or
START_WORKER=true npm run dev
```

Expected output:
```
Worker process started successfully
```

### Check Health
```bash
curl http://localhost:3000/health

{
  "status": "ok",
  "timestamp": "2025-11-21T10:35:00Z",
  "websocket": {
    "connectedOrders": 2,
    "totalClients": 3
  }
}
```

## Troubleshooting

### No messages received on WebSocket

1. **Check Redis is running:**
   ```bash
   redis-cli ping
   # Should return: PONG
   ```

2. **Check worker is running:**
   ```bash
   # In separate terminal
   npm run worker
   ```

3. **Check server logs:**
   ```
   Should see: "Queue Events Manager initialized and attached to order queue"
   ```

4. **Check WebSocket connection:**
   - Postman should show green "Connected" status
   - Should receive `connection` and `subscribed` messages

### Messages stop coming

1. **Check job is still processing:**
   - Look at worker logs for processing steps

2. **Check Redis Pub/Sub:**
   ```bash
   redis-cli
   > SUBSCRIBE order:{orderId}
   # Should see messages flowing
   ```

3. **Check WebSocket is still open:**
   - Postman WebSocket tab should still be connected
   - No "Disconnect" button shown means connection died

### Job fails silently

1. **Check order in database:**
   ```bash
   # From REST endpoint
   GET /api/orders/status/{orderId}
   ```

2. **Check job in BullMQ:**
   ```bash
   redis-cli
   > LRANGE bull:orders:waiting 0 -1
   > LRANGE bull:orders:completed 0 -1
   > LRANGE bull:orders:failed 0 -1
   ```

3. **Check worker logs:**
   - Should show error message

## Key Design Decisions

### 1. Redis Pub/Sub for Broadcasting
- Scalable: Each WebSocket client subscribes independently
- Decoupled: Worker doesn't know about WebSocket clients
- Simple: No need for complex state management

### 2. Separate Publisher Connection
- QueueEventsManager uses separate Redis connection
- Prevents blocking main queue connection
- Each connection can handle concurrent operations

### 3. Progress Percentages
- routing: 10-30%
- building: 50-70%
- submitted: 75-90% (depends on attempts)
- confirmed: 100%
- Provides clear visual feedback to client

### 4. Worker Initialization in server.ts
- QueueEventsManager created in server startup
- Attaches to queue for monitoring
- Separate worker process (npm run worker) also runs independently
- Ensures events are captured regardless of where job is processed

## Message Format

All messages use consistent JSON structure:

```typescript
{
  type: string,              // Event type: "connection", "routing", "building", "submitted", "confirmed", "failed", etc.
  orderId: string,           // UUID of the order
  timestamp: string,         // ISO 8601 timestamp
  message?: string,          // Human-readable description
  progress?: number,         // 0-100 progress percentage
  
  // Additional fields per event type:
  // routing: { quotesFetched, quote }
  // building: { chosenDex, quote }
  // submitted: { attempt, maxAttempts }
  // confirmed: { txHash, dex }
  // failed: { error, final, totalAttempts }
  // execution-failed: { transient, retriesRemaining }
  // retry-pending: { delay, nextAttempt }
}
```

## Production Considerations

1. **Redis Persistence:**
   - Configure Redis `appendonly yes` for durability
   - Pub/Sub messages are not persisted (transient only)
   - Use Streams for durable event history if needed

2. **Database Backups:**
   - Regular snapshots of order database
   - Track txHash for reconciliation

3. **WebSocket Keep-Alives:**
   - Implement ping/pong to detect stale connections
   - Client should reconnect if connection drops

4. **Error Handling:**
   - Currently shows last error in job
   - Consider error tracking service (Sentry, etc.)
   - Implement retry policies

5. **Monitoring:**
   - Monitor queue depth (Redis: `LLEN bull:orders:*`)
   - Track worker CPU/memory
   - Alert on stuck jobs (no progress > 5 min)

6. **Scaling:**
   - Use Redis Cluster for high availability
   - Run multiple worker processes
   - Use connection pooling for database

## File Structure

```
src/
├── server.ts                      # Main HTTP/WebSocket server
├── routes/
│   └── orders.ts                  # REST endpoints
├── services/
│   ├── websocket-manager.ts       # WebSocket connection registry
│   ├── queue-events.ts            # BullMQ event listener
│   ├── mockDexRouter.ts           # (existing)
│   └── redisClient.ts             # (existing)
├── queue/
│   ├── index.ts                   # BullMQ queue setup
│   └── worker.ts                  # Job processor with events
├── models/
│   └── order.entity.ts            # Order database model
└── utils/
    └── backoff.ts                 # Retry backoff logic
```

## Summary

This implementation provides:

✅ Full real-time WebSocket order status streaming
✅ Modular architecture (WebSocket Manager, Queue Events)
✅ Robust error handling and retries
✅ Progress reporting (0-100%)
✅ Production-grade code quality
✅ Zero silent connections (always sends messages)
✅ Automatic cleanup on disconnect
✅ Support for multiple concurrent clients per order
✅ Separate worker process support
✅ Comprehensive logging

The system ensures clients **always** receive real-time updates as orders move through their lifecycle.
