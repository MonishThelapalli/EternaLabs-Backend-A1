#!/usr/bin/env bash

# ============================================================================
# WebSocket Order Streaming - Quick Start Guide
# ============================================================================

# This script demonstrates the complete flow of creating an order and 
# monitoring it via WebSocket

# Prerequisites:
# - Node.js and npm installed
# - Redis running on localhost:6379
# - Server running: npm run dev
# - Worker running in separate terminal: npm run worker
# - jq installed (for JSON parsing): brew install jq

# ============================================================================
# STEP 1: Create an order via REST API
# ============================================================================

echo "=== STEP 1: Creating order via REST API ==="

RESPONSE=$(curl -s -X POST http://localhost:3000/api/orders/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tokenIn": "SOL",
    "tokenOut": "USDC",
    "amount": 10,
    "slippage": 0.5
  }')

echo "$RESPONSE" | jq .

# Extract orderId from response
ORDER_ID=$(echo "$RESPONSE" | jq -r '.orderId')
WS_URL=$(echo "$RESPONSE" | jq -r '.wsUrl')

echo ""
echo "Order created!"
echo "  Order ID: $ORDER_ID"
echo "  WebSocket URL: $WS_URL"
echo ""

# ============================================================================
# STEP 2: Get REST status (optional, shows current state)
# ============================================================================

echo "=== STEP 2: Checking order status via REST (before processing) ==="

curl -s -X GET http://localhost:3000/api/orders/status/$ORDER_ID | jq .

echo ""
echo "Note: Status will be 'pending' initially, then will progress through"
echo "      routing, building, submitted, confirmed as worker processes it."
echo ""

# ============================================================================
# STEP 3: WebSocket Connection (automatic message streaming)
# ============================================================================

echo "=== STEP 3: Connecting via WebSocket (interactive) ==="
echo ""
echo "Use one of the methods below to connect and receive real-time updates:"
echo ""
echo "A) Using wscat (npm install -g wscat):"
echo "   wscat -c \"$WS_URL\""
echo ""
echo "B) Using websocat (brew install websocat):"
echo "   websocat \"$WS_URL\""
echo ""
echo "C) Using Postman:"
echo "   1. New Request → WebSocket"
echo "   2. URL: $WS_URL"
echo "   3. Click 'Connect'"
echo "   4. Watch for incoming messages"
echo ""
echo "D) Using Node.js:"
echo "   const ws = new WebSocket('$WS_URL');"
echo "   ws.onmessage = (event) => console.log(JSON.parse(event.data));"
echo ""

# ============================================================================
# STEP 4: Monitor the order
# ============================================================================

echo "=== STEP 4: Monitor real-time updates ==="
echo ""
echo "You will receive messages in this order:"
echo ""
echo "  1. 'connection'  → Connected to stream"
echo "  2. 'subscribed'  → Listening to updates"
echo "  3. 'routing'     → Fetching quotes (10-30% progress)"
echo "  4. 'building'    → Building transaction (50-70% progress)"
echo "  5. 'submitted'   → Sending to chain (75-90% progress)"
echo "  6. 'confirmed'   → Success with txHash (100% progress)"
echo ""
echo "OR if it fails:"
echo "  6. 'execution-failed' → Attempt failed"
echo "  7. 'retry-pending'    → Waiting before retry"
echo "  6. 'failed'           → Final failure"
echo ""

# ============================================================================
# HELPER: Show expected messages
# ============================================================================

cat << 'EOF'

Expected WebSocket Messages:

1. CONNECTION ACK (immediately):
{
  "type": "connection",
  "message": "Connected to order status stream",
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-11-21T10:30:00Z"
}

2. SUBSCRIPTION CONFIRMED:
{
  "type": "subscribed",
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Subscribed to real-time updates for order...",
  "timestamp": "2025-11-21T10:30:00Z"
}

3. ROUTING PHASE:
{
  "type": "routing",
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "progress": 10,
  "message": "Fetching quotes from multiple DEXs...",
  "timestamp": "2025-11-21T10:30:01Z"
}

4. BUILDING PHASE:
{
  "type": "building",
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "progress": 50,
  "message": "Building transaction on raydium...",
  "chosenDex": "raydium",
  "timestamp": "2025-11-21T10:30:03Z"
}

5. SUBMISSION PHASE:
{
  "type": "submitted",
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "progress": 80,
  "message": "Submitting transaction (attempt 1/3)...",
  "attempt": 1,
  "maxAttempts": 3,
  "timestamp": "2025-11-21T10:30:05Z"
}

6. SUCCESS:
{
  "type": "confirmed",
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "progress": 100,
  "message": "Order successfully executed",
  "txHash": "5Jtmhqjc5v9KVCqJxVbL4Xj5Z5Z5Z5Z5Z5Z5Z5Z5Z",
  "dex": "raydium",
  "timestamp": "2025-11-21T10:30:06Z"
}

EOF

echo ""
echo "=== Troubleshooting ==="
echo ""
echo "No messages received?"
echo "  1. Check worker is running: npm run worker"
echo "  2. Check Redis: redis-cli ping (should return PONG)"
echo "  3. Check logs: Look for 'Queue Events Manager initialized'"
echo ""
echo "Connection drops?"
echo "  1. Reconnect to WebSocket URL"
echo "  2. Reconnect using same Order ID"
echo ""
