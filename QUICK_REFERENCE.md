# ⚡ Quick Start Cheat Sheet

## 30-Second Setup

```powershell
cd c:\Users\monis\Eternalabs\backendproj\mockorder
npm install
npm run dev
```

✅ **Server running on http://localhost:3000**

---

## With Redis (Full Features)

**Terminal 1:**
```powershell
docker run -d -p 6379:6379 redis:7-alpine
npm run dev
```

**Terminal 2:**
```powershell
npm run worker
```

✅ **Full system running**

---

## API Quick Test

```bash
# Create order
curl -X POST http://localhost:3000/api/orders/execute \
  -H "Content-Type: application/json" \
  -d '{"tokenIn":"SOL","tokenOut":"USDC","amount":100}'

# Get order ID from response, then:
curl http://localhost:3000/api/orders/status/{orderId}
```

---

## Common Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start server (hot reload) |
| `npm run worker` | Start job processor |
| `npm run build` | Compile TypeScript |
| `npm run test` | Run tests |
| `npm start` | Run compiled version |

---

## Environment

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | 3000 | HTTP port |
| `REDIS_HOST` | 127.0.0.1 | Redis hostname |
| `REDIS_PORT` | 6379 | Redis port |
| `REDIS_DISABLED` | false | Set to `true` for in-memory mode |
| `DB_TYPE` | sqlite | Use `postgres` for production |

---

## Folder Structure

```
src/
├── server.ts          → Main Express + WebSocket
├── db.ts              → Database config
├── routes/orders.ts   → REST API
├── queue/             → Job queue
├── services/          → Business logic
└── utils/             → Helpers
```

---

## Status Checks

### Is Redis running?
```powershell
docker ps | findstr redis
# or
redis-cli ping
```

### Is server responding?
```powershell
curl http://localhost:3000/api/orders/status/test
```

### Are tests passing?
```powershell
npm run test
```

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| **Could not connect 127.0.0.1:6379** | This is OK! Server uses in-memory fallback. Start Redis if needed. |
| **Port 3000 in use** | Kill process: `Stop-Process -Port 3000` |
| **npm ERR! missing script** | Run `npm install` first |
| **TypeScript errors** | Run `npm run build` and check output |
| **Worker won't start** | Redis must be running: `docker run -d -p 6379:6379 redis:7-alpine` |

---

## Files Modified

✨ = New | 🔧 = Fixed | 📝 = Updated | ✅ = Verified

- ✨ `src/services/redisClient.ts` - New Redis + fallback
- 🔧 `src/queue/index.ts` - Fixed initialization
- 🔧 `src/queue/worker.ts` - Fixed validation
- 🔧 `src/server.ts` - Fixed logging
- 📝 `.env` - Added REDIS_DISABLED option
- 📝 `.env.example` - Updated docs
- ✨ `SETUP_AND_STARTUP.md` - Full guide
- ✨ `AUDIT_AND_FIX_REPORT.md` - Detailed report

---

## Key Insight

**Your system now has intelligent Redis fallback:**
- ✅ Server always starts (with or without Redis)
- ✅ Worker validates Redis before starting
- ✅ In-memory pub/sub works when Redis unavailable
- ✅ System degrades gracefully instead of crashing

---

**Ready to go!** 🚀
