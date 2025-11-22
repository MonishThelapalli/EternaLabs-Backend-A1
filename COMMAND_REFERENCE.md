# 🎯 Complete Command Reference

## Installation

```powershell
# Navigate to project
cd c:\Users\monis\Eternalabs\backendproj\mockorder

# Install all dependencies
npm install

# Verify installation
npm run build
```

---

## Running the Server

### Development Mode (Hot Reload)
```powershell
npm run dev
```
**Output:**
```
[INFO] Database initialized
[INFO] Order queue initialized with Redis
  (or [WARN] Could not connect to Redis... if Redis unavailable)
[INFO] Server listening on http://localhost:3000
```

**Endpoints available:**
- POST `/api/orders/execute` - Create order
- GET `/api/orders/status/{orderId}` - Get order status
- WS `/api/orders/status/{orderId}` - Real-time updates

---

## Running the Worker

### Prerequisites
- Redis must be running
- Database initialized (happens automatically)

### Start Worker
```powershell
npm run worker
```

**Output:**
```
[INFO] Database initialized
[INFO] Queue connected to Redis at 127.0.0.1:6379
[INFO] Order worker started
```

---

## Redis Management

### Docker (Recommended)
```powershell
# Start Redis in Docker
docker run -d -p 6379:6379 --name redis redis:7-alpine

# Verify Redis is running
docker ps | findstr redis

# Stop Redis
docker stop redis
docker rm redis

# View Redis logs
docker logs redis

# Connect to Redis CLI
docker exec -it redis redis-cli

# Inside Redis CLI:
# > PING        (should return PONG)
# > KEYS *      (show all keys)
# > EXIT        (quit)
```

### WSL (Windows Subsystem for Linux)
```powershell
# Enable WSL (run once)
wsl --install

# Inside WSL terminal:
sudo apt update
sudo apt install redis-server

# Start Redis
redis-server

# In another WSL terminal, test:
redis-cli ping    # Should return PONG
```

### Memurai (Windows Native)
```powershell
# Download from https://memurai.com/
# Run installer with default options
# Service starts automatically

# Test Redis connection
redis-cli ping    # Should return PONG
```

### In-Memory Mode (No Redis Needed)
```powershell
# Edit .env file and set:
# REDIS_DISABLED=true

npm run dev
```

---

## Building

### Build TypeScript
```powershell
npm run build
```
**Output:** Creates `dist/` folder with compiled JavaScript

### Run Compiled Version
```powershell
npm start
```
Runs the server from compiled JavaScript (no TypeScript compilation)

---

## Testing

### Run All Tests
```powershell
npm run test
```

### Run Specific Test
```powershell
npm run test -- backoff.test.ts
npm run test -- order-entity.test.ts
npm run test -- routing.test.ts
```

### Watch Mode
```powershell
npm run test -- --watch
```

### Coverage
```powershell
npm run test -- --coverage
```

---

## API Testing

### Using cURL (Command Line)

#### Create Order
```bash
curl -X POST http://localhost:3000/api/orders/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tokenIn": "SOL",
    "tokenOut": "USDC",
    "amount": 100,
    "slippage": 0.01
  }'
```

**Response:**
```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "wsUpgrade": "ws://localhost:3000/api/orders/status/550e8400-e29b-41d4-a716-446655440000"
}
```

#### Get Order Status
```bash
curl http://localhost:3000/api/orders/status/550e8400-e29b-41d4-a716-446655440000
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "confirmed",
  "orderType": "market",
  "tokenIn": "SOL",
  "tokenOut": "USDC",
  "amount": "100",
  "slippage": 0.01,
  "quotes": [...],
  "attempts": 1,
  "txHash": "tx123abc",
  "lastError": null
}
```

### Using Postman

1. Import `postman_collection.json`
2. Set base URL to `http://localhost:3000`
3. Create order via `/api/orders/execute`
4. Check status via `/api/orders/status/{orderId}`
5. Connect WebSocket to see real-time updates

### Using JavaScript

```javascript
// Create order
const response = await fetch('http://localhost:3000/api/orders/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tokenIn: 'SOL',
    tokenOut: 'USDC',
    amount: 100,
    slippage: 0.01
  })
});

const { orderId, wsUpgrade } = await response.json();

// Get status
const status = await fetch(`http://localhost:3000/api/orders/status/${orderId}`);
const order = await status.json();
console.log('Order status:', order);

// Real-time updates via WebSocket
const ws = new WebSocket(wsUpgrade);
ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  console.log('Status update:', update);
};
```

---

## Debugging

### Enable Debug Logging
```powershell
# Linux/Mac/WSL
DEBUG=* npm run dev

# Windows PowerShell
$env:DEBUG = '*'; npm run dev
```

### View TypeScript Source Maps
```powershell
npm run build
# Source maps are in dist/
```

### Check Redis Connection
```powershell
# Start server
npm run dev

# In another terminal, check Redis
docker exec redis redis-cli PING

# Or use redis-cli directly
redis-cli PING
```

### Monitor Redis Activity
```powershell
# Watch Redis commands in real-time
redis-cli MONITOR

# Or in Docker
docker exec -it redis redis-cli MONITOR
```

---

## Database

### SQLite (Development)

```powershell
# Connect to SQLite database
sqlite3 orderdb.sqlite3

# Inside SQLite CLI:
.tables              # Show tables
SELECT * FROM order; # Query orders
.exit                # Exit
```

### PostgreSQL (Production)

```powershell
# Connect to PostgreSQL
psql -h localhost -U postgres -d orderdb

# Inside psql CLI:
\dt                  # List tables
SELECT * FROM "order"; # Query orders
\q                   # Quit

# Or use GUI tools:
# - pgAdmin (Web UI)
# - DBeaver (Desktop app)
# - VS Code PostgreSQL extension
```

---

## Port Management

### Check if Port is in Use
```powershell
Get-NetTCPConnection -LocalPort 3000
# or
netstat -ano | findstr :3000
```

### Kill Process on Port
```powershell
# Find PID
$process = Get-NetTCPConnection -LocalPort 3000
Stop-Process -Id $process.OwningProcess

# Or use a custom port
$env:PORT = 3001
npm run dev
```

---

## Environment Management

### View Current Configuration
```powershell
# Windows - Display .env file
Get-Content .env

# Linux/WSL
cat .env
```

### Set Temporary Environment Variables
```powershell
# Windows PowerShell
$env:PORT = 3001
$env:REDIS_DISABLED = 'true'
npm run dev

# Linux/WSL/Mac (new session only)
export PORT=3001
export REDIS_DISABLED=true
npm run dev
```

### Permanent Configuration
Edit `.env` file:
```dotenv
PORT=3001
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_DISABLED=false
DB_TYPE=postgres
DB_HOST=db.example.com
DB_PORT=5432
DB_NAME=mydb
DB_USER=admin
DB_PASS=secret
```

---

## Cleanup

### Remove Node Modules (Free Space)
```powershell
rm -r node_modules
rm package-lock.json

# Then reinstall
npm install
```

### Clean Build
```powershell
rm -r dist
npm run build
```

### Remove SQLite Database
```powershell
rm -r orderdb.sqlite3
```

### Remove Redis Data
```powershell
# Docker
docker exec redis redis-cli FLUSHALL

# Memurai/Native Redis
redis-cli FLUSHALL
```

---

## Multiple Instances

### Run Server on Different Ports
```powershell
# Terminal 1
npm run dev          # Port 3000

# Terminal 2
$env:PORT = 3001
npm run dev

# Terminal 3
$env:PORT = 3002
npm run dev
```

### Multiple Workers
```powershell
# Terminal 1
npm run worker

# Terminal 2
npm run worker

# Terminal 3
npm run worker
```

---

## Production Deployment

### Build for Production
```powershell
npm run build
npm run test          # Verify tests pass
```

### Run in Production Mode
```powershell
# From compiled source
npm start

# With environment variables
$env:NODE_ENV = 'production'
$env:PORT = 8080
$env:DB_TYPE = 'postgres'
npm start
```

### Health Check
```powershell
curl http://localhost:8080/api/orders/status/test

# Should respond (even if order doesn't exist)
# 200 OK if working
# Timeouts if failed
```

---

## Performance Monitoring

### Monitor Memory Usage
```powershell
# Windows Task Manager
tasklist /v | findstr node

# PowerShell
Get-Process node | select CPU, WorkingSet
```

### Monitor Database Queries
```powershell
# Edit db.ts and set logging: true
# TypeORM will log all SQL queries

# For production, use monitoring tools:
# - New Relic
# - DataDog
# - Prometheus
```

### Monitor Redis Usage
```powershell
redis-cli INFO memory
redis-cli INFO stats
redis-cli INFO keyspace
```

---

## Quick Troubleshooting Commands

```powershell
# Test Redis
redis-cli ping

# Test Database
npm run build && npm run test -- db-order.test.ts

# Test API
curl http://localhost:3000/api/orders/status/test

# Check Ports
netstat -ano | findstr 3000
netstat -ano | findstr 6379

# View Logs (if saved)
Get-Content logs/*.log

# Clear Everything and Start Fresh
rm -r dist node_modules
rm -r orderdb.sqlite3
npm install
npm run dev
```

---

## Scripts Summary

| Command | Purpose | Output |
|---------|---------|--------|
| `npm run dev` | Development server | Hot reload on file changes |
| `npm run worker` | Job processor | Processes orders from queue |
| `npm run build` | Compile TypeScript | Creates `dist/` folder |
| `npm start` | Run compiled version | No TypeScript compilation |
| `npm run test` | Run tests | Jest output |

---

**Happy coding!** 🚀
