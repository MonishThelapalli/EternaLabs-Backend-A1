#!/usr/bin/env python3
"""
WebSocket Order Streaming - Visual Message Flow Analyzer

This script shows the complete message flow from order creation to completion.
Run it to see a visual representation of the message sequence.
"""

import json
from datetime import datetime, timedelta

# Define the complete message sequence
messages = [
    {
        "sequence": 1,
        "source": "CLIENT",
        "action": "POST /api/orders/execute",
        "data": {
            "tokenIn": "SOL",
            "tokenOut": "USDC",
            "amount": 10,
            "slippage": 0.5
        },
        "description": "Client creates order"
    },
    {
        "sequence": 2,
        "source": "SERVER",
        "action": "201 Created",
        "data": {
            "success": True,
            "orderId": "550e8400-e29b-41d4-a716-446655440000",
            "jobId": "1",
            "status": "pending",
            "wsUrl": "ws://localhost:3000/api/orders/status/550e8400-e29b-41d4-a716-446655440000"
        },
        "description": "Server returns orderId and WebSocket URL"
    },
    {
        "sequence": 3,
        "source": "CLIENT",
        "action": "HTTP Upgrade",
        "data": {
            "upgrade": "websocket",
            "path": "/api/orders/status/550e8400-e29b-41d4-a716-446655440000"
        },
        "description": "Client upgrades to WebSocket"
    },
    {
        "sequence": 4,
        "source": "SERVER",
        "action": "WebSocket Message: connection",
        "data": {
            "type": "connection",
            "message": "Connected to order status stream",
            "orderId": "550e8400-e29b-41d4-a716-446655440000"
        },
        "description": "Server sends connection ACK"
    },
    {
        "sequence": 5,
        "source": "SERVER",
        "action": "WebSocket Message: subscribed",
        "data": {
            "type": "subscribed",
            "orderId": "550e8400-e29b-41d4-a716-446655440000",
            "message": "Subscribed to real-time updates for order..."
        },
        "description": "Server confirms subscription to order channel"
    },
    {
        "sequence": 6,
        "source": "QUEUE",
        "action": "Job Enqueued",
        "data": {
            "queue": "orders",
            "job_id": "1",
            "orderId": "550e8400-e29b-41d4-a716-446655440000",
            "status": "waiting"
        },
        "description": "Job added to BullMQ queue"
    },
    {
        "sequence": 7,
        "source": "WORKER",
        "action": "Job Active",
        "data": {
            "job_id": "1",
            "orderId": "550e8400-e29b-41d4-a716-446655440000",
            "status": "active"
        },
        "description": "Worker picks up job from queue"
    },
    {
        "sequence": 8,
        "source": "WEBSOCKET",
        "action": "Message: routing",
        "data": {
            "type": "routing",
            "orderId": "550e8400-e29b-41d4-a716-446655440000",
            "progress": 10,
            "message": "Fetching quotes from multiple DEXs..."
        },
        "description": "Client receives routing start (10%)"
    },
    {
        "sequence": 9,
        "source": "WORKER",
        "action": "Fetching Quotes",
        "data": {
            "orderId": "550e8400-e29b-41d4-a716-446655440000",
            "dexes": ["raydium", "meteora"]
        },
        "description": "Worker fetches quotes in parallel"
    },
    {
        "sequence": 10,
        "source": "WEBSOCKET",
        "action": "Message: routing",
        "data": {
            "type": "routing",
            "orderId": "550e8400-e29b-41d4-a716-446655440000",
            "progress": 30,
            "message": "Received 2 quotes",
            "quotesFetched": 2
        },
        "description": "Client receives quotes received (30%)"
    },
    {
        "sequence": 11,
        "source": "WEBSOCKET",
        "action": "Message: building",
        "data": {
            "type": "building",
            "orderId": "550e8400-e29b-41d4-a716-446655440000",
            "progress": 50,
            "message": "Building transaction on raydium...",
            "chosenDex": "raydium"
        },
        "description": "Client receives building start (50%)"
    },
    {
        "sequence": 12,
        "source": "WORKER",
        "action": "Building Transaction",
        "data": {
            "orderId": "550e8400-e29b-41d4-a716-446655440000",
            "dex": "raydium",
            "simulation": True
        },
        "description": "Worker simulates transaction building"
    },
    {
        "sequence": 13,
        "source": "WEBSOCKET",
        "action": "Message: building",
        "data": {
            "type": "building",
            "orderId": "550e8400-e29b-41d4-a716-446655440000",
            "progress": 70,
            "message": "Transaction built, ready to submit"
        },
        "description": "Client receives ready to submit (70%)"
    },
    {
        "sequence": 14,
        "source": "WEBSOCKET",
        "action": "Message: submitted",
        "data": {
            "type": "submitted",
            "orderId": "550e8400-e29b-41d4-a716-446655440000",
            "progress": 80,
            "message": "Submitting transaction (attempt 1/3)...",
            "attempt": 1,
            "maxAttempts": 3
        },
        "description": "Client receives submission start (80%)"
    },
    {
        "sequence": 15,
        "source": "WORKER",
        "action": "Executing Swap",
        "data": {
            "orderId": "550e8400-e29b-41d4-a716-446655440000",
            "dex": "raydium",
            "attempt": 1
        },
        "description": "Worker executes swap (simulated)"
    },
    {
        "sequence": 16,
        "source": "WEBSOCKET",
        "action": "Message: confirmed",
        "data": {
            "type": "confirmed",
            "orderId": "550e8400-e29b-41d4-a716-446655440000",
            "progress": 100,
            "message": "Order successfully executed",
            "txHash": "5Jtmhqjc5v9KVCqJxVbL4Xj5Z5Z5Z5Z5Z5Z5Z5Z5Z",
            "dex": "raydium"
        },
        "description": "Client receives success (100%)"
    },
    {
        "sequence": 17,
        "source": "DATABASE",
        "action": "Order Updated",
        "data": {
            "orderId": "550e8400-e29b-41d4-a716-446655440000",
            "status": "confirmed",
            "txHash": "5Jtmhqjc5v9KVCqJxVbL4Xj5Z5Z5Z5Z5Z5Z5Z5Z5Z"
        },
        "description": "Order persisted in database"
    }
]

# Failure scenario
failure_messages = [
    {
        "sequence": 14,
        "source": "WEBSOCKET",
        "action": "Message: submitted",
        "data": {"type": "submitted", "progress": 80}
    },
    {
        "sequence": 15,
        "source": "WORKER",
        "action": "Execution Failed",
        "data": {"attempt": 1, "error": "Network timeout"}
    },
    {
        "sequence": 16,
        "source": "WEBSOCKET",
        "action": "Message: execution-failed",
        "data": {
            "type": "execution-failed",
            "message": "Attempt 1 failed: Network timeout",
            "attempt": 1,
            "maxAttempts": 3,
            "transient": True,
            "retriesRemaining": 2
        }
    },
    {
        "sequence": 17,
        "source": "WEBSOCKET",
        "action": "Message: retry-pending",
        "data": {
            "type": "retry-pending",
            "message": "Retrying in 500ms...",
            "delay": 500,
            "nextAttempt": 2
        }
    },
    {
        "sequence": 18,
        "source": "WORKER",
        "action": "Retry Attempt 2",
        "data": {"attempt": 2}
    },
    {
        "sequence": 19,
        "source": "WEBSOCKET",
        "action": "Message: confirmed (or failed)",
        "data": {
            "type": "confirmed",
            "message": "Order successfully executed on retry",
            "progress": 100
        }
    }
]

def print_header():
    print("""
╔════════════════════════════════════════════════════════════════════════════╗
║                 WEBSOCKET ORDER STREAMING - MESSAGE FLOW                   ║
║                                                                            ║
║  Complete sequence of messages from order creation to completion          ║
╚════════════════════════════════════════════════════════════════════════════╝
    """)

def print_message_flow(title, messages_list, indent=0):
    prefix = "  " * indent
    
    print(f"\n{prefix}{'─' * 80}")
    print(f"{prefix}{title}")
    print(f"{prefix}{'─' * 80}\n")
    
    for msg in messages_list:
        seq = msg["sequence"]
        source = msg["source"]
        action = msg["action"]
        description = msg["description"]
        
        # Color coding by source
        if source == "CLIENT":
            color = "🔵"
        elif source == "SERVER":
            color = "🟢"
        elif source == "WORKER":
            color = "🟠"
        elif source == "WEBSOCKET":
            color = "⚡"
        elif source == "QUEUE":
            color = "📦"
        elif source == "DATABASE":
            color = "💾"
        else:
            color = "⚪"
        
        print(f"{prefix}{seq:2d}. {color} [{source:9s}] {action:30s} → {description}")
        
        # Print data if it's a WebSocket message
        if msg["source"] == "WEBSOCKET" and "type" in msg["data"]:
            msg_type = msg["data"]["type"]
            progress = msg["data"].get("progress", "")
            msg_text = msg["data"].get("message", "")
            
            if progress:
                print(f"{prefix}    └─ [{msg_type:15s}] {progress}% - {msg_text}")
            else:
                print(f"{prefix}    └─ [{msg_type:15s}] {msg_text}")
    
    print()

def print_architecture():
    print(f"""
ARCHITECTURE:

┌─────────────────┐
│ BROWSER CLIENT  │ ◄──────── User creates order
└────────┬────────┘
         │ (1) POST /api/orders/execute
         ▼
┌─────────────────────────────────────────┐
│ EXPRESS REST SERVER                     │
│ - Create order in database              │
│ - Enqueue job to BullMQ                 │
│ - Return orderId + wsUrl                │
└────────┬────────────────┬───────────────┘
         │ (2) Upgrade    │ (3) Job enqueued
         │    to WS       │
         ▼                ▼
    ┌────────────────────────────────────┐
    │ BULLMQ QUEUE (Redis)               │
    │ Queue name: "orders"               │
    │ Job state: waiting → active → done │
    └────────────────┬───────────────────┘
                     │ (4) Worker picks up
                     ▼
         ┌──────────────────────────┐
         │ QUEUE WORKER             │
         │ - Process job            │
         │ - Publish progress       │
         │ - On success/fail: done  │
         └────────────┬─────────────┘
                      │ (5) Publish to Redis Pub/Sub
                      │    channel: order:{orderId}
                      ▼
         ┌──────────────────────────┐
         │ REDIS PUB/SUB            │
         │ - Receive messages       │
         │ - Forward to subscribers │
         └────────────┬─────────────┘
                      │ (6) Receive messages
                      ▼
    ┌─────────────────────────────────────┐
    │ WEBSOCKET SERVER                    │
    │ - Subscribe to Redis channel        │
    │ - Forward messages to client        │
    └────────────┬────────────────────────┘
                 │ (7) Send to client
                 ▼
            ┌──────────────┐
            │ BROWSER UI   │
            │ Shows status │
            │ in real-time │
            └──────────────┘
    """)

def print_progress_bar():
    print("""
PROGRESS TRACKING:

  0%  10%      30%      50%      70%    80% 90%    100%
  ├────┼────────┼────────┼────────┼──────┼──┼──────┼
  │    │ ROUTING│        │BUILDING│      │  │      │
  │    │ Quotes │        │  TXN   │      │  │      │
  │    │ Fetched│        │ Built  │      │  │      │
  │    │        │        │        │SUBMI│  │      │
  │    │        │        │        │TTING│  │      │
  │    │        │        │        │     │  │CONFIRM│
  │    │        │        │        │     │  │  ED  │
  ────────────────────────────────────────────────────
    """)

def main():
    print_header()
    
    print("\n" + "=" * 80)
    print("SUCCESS SCENARIO (Order Completed)")
    print("=" * 80)
    print_message_flow("Complete Message Sequence", messages)
    
    print("\n" + "=" * 80)
    print("FAILURE SCENARIO (With Retry)")
    print("=" * 80)
    print_message_flow("Messages with Retry on Failure", failure_messages)
    
    print_architecture()
    print_progress_bar()
    
    print(f"""
KEY INSIGHTS:

1. CONNECTION GUARANTEE
   ✅ Every WebSocket receives "connection" + "subscribed" immediately
   ✅ No silent connections - minimum 2 messages on connect

2. PROGRESS VISIBILITY
   ✅ Progress updates sent as job moves through phases
   ✅ Phases: routing (10-30%) → building (50-70%) → submitted (75-90%) → confirmed (100%)
   ✅ Client can show smooth progress bar

3. ERROR HANDLING
   ✅ Failed attempts send "execution-failed" message
   ✅ Before retry, "retry-pending" message sent with delay info
   ✅ Final failure sends "failed" message with error details

4. MESSAGE ROUTING
   ✅ Worker publishes to channel: order:{{orderId}}
   ✅ Server listens on same channel
   ✅ All connected clients for that order receive the message
   ✅ Redis Pub/Sub ensures scalability

5. CLEANUP
   ✅ On WebSocket close: unregister from manager
   ✅ On server shutdown: close all connections gracefully
   ✅ No resource leaks or orphaned connections

6. TIMING
   ✅ Messages arrive in order (Redis Pub/Sub guarantees order)
   ✅ Latency < 10ms (direct Pub/Sub, no database queries on updates)
   ✅ Real-time experience for users

TESTING:

1. Create order:
   POST http://localhost:3000/api/orders/execute

2. Copy orderId from response

3. Connect to WebSocket:
   ws://localhost:3000/api/orders/status/{{orderId}}

4. Observe real-time messages arriving

5. Check database for final status:
   GET http://localhost:3000/api/orders/status/{{orderId}}
    """)

if __name__ == "__main__":
    main()
