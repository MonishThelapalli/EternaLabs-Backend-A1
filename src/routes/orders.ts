import express, { Request, Response } from 'express';
import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import { enqueueOrder } from '../queue';
import { AppDataSource } from '../db';
import { Order } from '../models/order.entity';

const logger = pino();
const router = express.Router();

router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { orderType, tokenIn, tokenOut, amount, slippage } = req.body;

    if (!tokenIn || !tokenOut || !amount) {
      return res.status(400).json({
        error: 'Bad Request',
        details: 'tokenIn, tokenOut, and amount are required',
      });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({
        error: 'Bad Request',
        details: 'amount must be a positive number',
      });
    }

    const orderId = uuidv4();
    const orderRepo = AppDataSource.getRepository(Order);

    const order = orderRepo.create({
      id: orderId,
      orderType: orderType || 'market',
      tokenIn,
      tokenOut,
      amount: amount.toString(),
      slippage: slippage || 0,
      status: 'pending',
    });

    await orderRepo.save(order);
    logger.info({ orderId, tokenIn, tokenOut, amount }, 'Order created');

    try {
      const job = await enqueueOrder({
        orderId,
        orderType: orderType || 'market',
        tokenIn,
        tokenOut,
        amount,
        slippage: slippage || 0,
      });

      logger.info({ orderId, jobId: job.id }, 'Order enqueued');

      const host = req.get('host') || 'localhost:3000';
      const protocol = req.protocol === 'https' ? 'wss' : 'ws';
      const wsUrl = `${protocol}://${host}/api/orders/status/${orderId}`;

      return res.status(201).json({
        success: true,
        orderId,
        jobId: job.id,
        status: order.status,
        message: 'Order created and enqueued for processing',
        wsUrl: wsUrl,
        instructions: {
          rest: `GET http://localhost:3000/api/orders/status/${orderId}`,
          websocket: `Upgrade connection to ${wsUrl} for real-time updates`,
        },
      });
    } catch (err) {
      logger.error({ err, orderId }, 'Failed to enqueue order');
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        details: 'Failed to queue order. Redis may be unavailable.',
        orderId, // Still return the order ID so client can query status
      });
    }
  } catch (err) {
    logger.error({ err }, 'Error creating order');
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' ? undefined : String(err),
    });
  }
});

router.get('/status/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    if (!orderId || !orderId.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        details: 'orderId is required',
      });
    }

    const orderRepo = AppDataSource.getRepository(Order);
    const order = await orderRepo.findOneBy({ id: orderId });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        details: `Order ${orderId} not found`,
      });
    }

    return res.json({
      success: true,
      ...order,
      note: 'For real-time updates, upgrade to WebSocket on this same endpoint',
    });
  } catch (err) {
    logger.error({ err }, 'Error fetching order status');
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' ? undefined : String(err),
    });
  }
});

export default router;