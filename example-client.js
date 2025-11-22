#!/usr/bin/env node

/**
 * WebSocket Order Streaming - Example Node.js Client
 * 
 * This script demonstrates:
 * 1. Creating an order via REST API
 * 2. Connecting to WebSocket for real-time updates
 * 3. Handling all message types
 * 4. Tracking progress and final status
 * 
 * Usage: node example-client.js
 */

const http = require('http');
const WebSocket = require('ws');

// Configuration
const API_HOST = 'localhost';
const API_PORT = 3000;
const API_URL = `http://${API_HOST}:${API_PORT}`;
const WS_PROTOCOL = 'ws';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(`${color}${new Date().toISOString()} ${args.join(' ')}${colors.reset}`);
}

function step(num, title) {
  console.log(`\n${colors.bright}${colors.blue}${'='.repeat(70)}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}STEP ${num}: ${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${'='.repeat(70)}${colors.reset}`);
}

/**
 * Create an order via REST API
 */
async function createOrder() {
  return new Promise((resolve, reject) => {
    const orderData = JSON.stringify({
      tokenIn: 'SOL',
      tokenOut: 'USDC',
      amount: 10,
      slippage: 0.5,
    });

    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: '/api/orders/execute',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(orderData),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.success && response.orderId) {
            resolve(response);
          } else {
            reject(new Error('Failed to create order: ' + data));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(orderData);
    req.end();
  });
}

/**
 * Connect to WebSocket and monitor order
 */
function monitorOrderViaWebSocket(orderId, wsUrl) {
  return new Promise((resolve, reject) => {
    log(colors.cyan, '🔌 Connecting to WebSocket:', wsUrl);

    const ws = new WebSocket(wsUrl);
    const messageLog = [];
    let lastProgressMessage = '';

    ws.on('open', () => {
      log(colors.green, '✅ WebSocket connected');
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        messageLog.push(message);

        const type = message.type || 'unknown';
        const timestamp = message.timestamp;
        const progress = message.progress !== undefined ? `${message.progress}%` : '';

        // Log message based on type
        switch (type) {
          case 'connection':
            log(colors.green, `📡 Connection established`);
            break;

          case 'subscribed':
            log(colors.green, `✅ Subscribed to order updates`);
            break;

          case 'routing':
            log(colors.yellow, `🔄 Routing: ${message.message} [${progress}]`);
            if (message.quotesFetched) {
              log(colors.dim, `   → Quotes fetched: ${message.quotesFetched}`);
            }
            break;

          case 'building':
            log(colors.yellow, `🏗️  Building: ${message.message} [${progress}]`);
            if (message.chosenDex) {
              log(colors.dim, `   → DEX: ${message.chosenDex}`);
            }
            break;

          case 'submitted':
            log(colors.yellow, `📤 Submitted: ${message.message} [${progress}]`);
            log(colors.dim, `   → Attempt ${message.attempt}/${message.maxAttempts}`);
            break;

          case 'confirmed':
            log(colors.green, `✨ CONFIRMED: ${message.message} [${progress}]`);
            log(colors.green, `   → TX Hash: ${message.txHash}`);
            log(colors.green, `   → DEX: ${message.dex}`);
            resolve({ success: true, message, messageLog });
            ws.close();
            break;

          case 'execution-failed':
            log(colors.red, `❌ Execution failed: ${message.message}`);
            log(colors.dim, `   → Attempt ${message.attempt}/${message.maxAttempts}`);
            log(colors.dim, `   → Transient: ${message.transient}, Retries remaining: ${message.retriesRemaining}`);
            break;

          case 'retry-pending':
            log(colors.yellow, `⏳ Retry pending: ${message.message}`);
            log(colors.dim, `   → Next attempt in ${message.delay}ms`);
            break;

          case 'failed':
            log(colors.red, `💥 FAILED: ${message.message}`);
            log(colors.red, `   → Error: ${message.error}`);
            if (message.totalAttempts) {
              log(colors.dim, `   → Total attempts: ${message.totalAttempts}`);
            }
            resolve({ success: false, message, messageLog });
            ws.close();
            break;

          default:
            log(colors.blue, `📨 ${type}: ${message.message || ''}`);
        }

        lastProgressMessage = `[${progress}] ${message.message || ''}`;
      } catch (err) {
        log(colors.red, '❌ Failed to parse message:', err.message);
      }
    });

    ws.on('close', () => {
      log(colors.cyan, '🔌 WebSocket disconnected');
    });

    ws.on('error', (err) => {
      log(colors.red, '❌ WebSocket error:', err.message);
      reject(err);
    });

    // Timeout after 60 seconds
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        log(colors.yellow, '⏱️  Timeout: closing WebSocket after 60 seconds');
        ws.close();
        resolve({ success: false, message: 'Timeout', messageLog });
      }
    }, 60000);
  });
}

/**
 * Main execution
 */
async function main() {
  try {
    // Step 1: Create order
    step(1, 'Creating Order via REST API');
    log(colors.cyan, 'Request: POST /api/orders/execute');

    const orderResponse = await createOrder();
    log(colors.green, '✅ Order created successfully');
    log(colors.bright, `   Order ID: ${orderResponse.orderId}`);
    log(colors.bright, `   Job ID: ${orderResponse.jobId}`);
    log(colors.bright, `   Status: ${orderResponse.status}`);
    log(colors.bright, `   WebSocket URL: ${orderResponse.wsUrl}`);

    const orderId = orderResponse.orderId;
    const wsUrl = orderResponse.wsUrl;

    // Step 2: Connect to WebSocket
    step(2, 'Connecting to WebSocket for Real-Time Updates');

    const result = await monitorOrderViaWebSocket(orderId, wsUrl);

    // Step 3: Summary
    step(3, 'Summary');

    console.log(`\n${colors.bright}${colors.cyan}Message History (${result.messageLog.length} messages):${colors.reset}`);
    result.messageLog.forEach((msg, idx) => {
      const progress = msg.progress !== undefined ? `${msg.progress}%` : '';
      const progressStr = progress ? `[${progress}]` : '';
      console.log(`  ${idx + 1}. ${msg.type.padEnd(20)} ${progressStr.padEnd(6)} - ${msg.message || ''}`);
    });

    if (result.success) {
      log(colors.green, `\n✨ ORDER COMPLETED SUCCESSFULLY ✨`);
      log(colors.green, `   TX Hash: ${result.message.txHash}`);
      log(colors.green, `   Total messages received: ${result.messageLog.length}`);
    } else {
      log(colors.red, `\n❌ ORDER PROCESSING FAILED ❌`);
      log(colors.red, `   Error: ${result.message.message}`);
      log(colors.red, `   Total messages received: ${result.messageLog.length}`);
    }

    process.exit(result.success ? 0 : 1);
  } catch (err) {
    log(colors.red, '💥 Fatal error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

// Run the client
main();
