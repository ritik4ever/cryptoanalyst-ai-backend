import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { PaymentService } from '../services/paymentService.js';

const router = express.Router();
const paymentService = new PaymentService();

// Get payment status
router.get('/:paymentId/status', authenticate, asyncHandler(async (req: any, res: any) => {
  const { paymentId } = req.params;
  const payment = await paymentService.getPaymentStatus(paymentId);
  
  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  res.json(payment);
}));

// x402pay webhook
router.post('/webhook', asyncHandler(async (req: any, res: any) => {
  const signature = req.headers['x-signature'] || req.headers['signature'];
  
  await paymentService.handlePaymentWebhook(req.body, signature);
  
  res.status(200).json({ received: true });
}));

// Revenue dashboard
router.get('/revenue/dashboard', authenticate, asyncHandler(async (req: any, res: any) => {
  const dashboard = await paymentService.getRevenueDashboard();
  res.json(dashboard);
}));

export default router;