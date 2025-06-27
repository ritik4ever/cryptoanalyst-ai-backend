import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { WalletService } from '../services/walletService.js';

const router = express.Router();
const walletService = new WalletService();

// Create wallet for user
router.post('/create', authenticate, asyncHandler(async (req: any, res: any) => {
  const userId = req.user.id;
  
  // Check if user already has a wallet
  if (req.user.walletId) {
    return res.status(400).json({ error: 'User already has a wallet' });
  }

  const walletId = await walletService.createUserWallet(userId);
  
  res.json({ walletId });
}));

// Get wallet balance
router.get('/:walletId/balance', authenticate, asyncHandler(async (req: any, res: any) => {
  const { walletId } = req.params;
  
  // Verify user owns this wallet
  if (req.user.walletId !== walletId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const balances = await walletService.getWalletBalance(walletId);
  
  res.json({ balances });
}));

// Get platform wallet address
router.get('/platform/address', asyncHandler(async (req: any, res: any) => {
  const address = await walletService.getPlatformWalletAddress();
  res.json({ address });
}));

export default router;