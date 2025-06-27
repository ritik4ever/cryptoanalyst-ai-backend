import { Coinbase, Wallet, Transfer } from '@coinbase/coinbase-sdk';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class WalletService {
  private coinbase: Coinbase;
  private platformWallet: Wallet | null = null;

  constructor() {
    this.coinbase = new Coinbase({
      apiKeyName: config.coinbase.apiKey,
      privateKey: config.coinbase.apiSecret,
    });
  }

  async initializePlatformWallet(): Promise<void> {
    try {
      // Create or import platform wallet
      this.platformWallet = await this.coinbase.createWallet();
      logger.info('Platform wallet initialized:', this.platformWallet.getId());
    } catch (error) {
      logger.error('Failed to initialize platform wallet:', error);
      throw error;
    }
  }

  async createUserWallet(userId: string): Promise<string> {
    try {
      const wallet = await this.coinbase.createWallet();
      const walletId = wallet.getId();
      
      // Update user with wallet ID
      await prisma.user.update({
        where: { id: userId },
        data: { walletId },
      });

      logger.info(`Created wallet ${walletId} for user ${userId}`);
      return walletId;
    } catch (error) {
      logger.error('Failed to create user wallet:', error);
      throw error;
    }
  }

  async distributePayment(paymentId: string, totalAmount: number): Promise<void> {
    try {
      if (!this.platformWallet) {
        throw new Error('Platform wallet not initialized');
      }

      // Get payment and create distributions
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: { user: true },
      });

      if (!payment) {
        throw new Error('Payment not found');
      }

      // Get all stakeholders
      const stakeholders = await prisma.stakeholder.findMany({
        where: { isActive: true },
      });

      const distributions = [];

      // Calculate distribution amounts
      for (const stakeholder of stakeholders) {
        const amount = totalAmount * (stakeholder.percentage.toNumber() / 100);
        distributions.push({
          paymentId,
          recipient: stakeholder.walletId,
          amount,
          type: stakeholder.type,
          status: 'pending',
        });
      }

      // Save distributions to database
      await prisma.paymentDistribution.createMany({
        data: distributions,
      });

      // Execute transfers
      for (const distribution of distributions) {
        try {
          const transfer = await this.platformWallet.createTransfer({
            amount: distribution.amount,
            assetId: 'usdc', // Using USDC for stable payments
            destination: distribution.recipient,
          });

          await transfer.wait();

          // Update distribution with transaction hash
          await prisma.paymentDistribution.updateMany({
            where: {
              paymentId,
              recipient: distribution.recipient,
              type: distribution.type,
            },
            data: {
              status: 'completed',
              txHash: transfer.getTransactionHash(),
            },
          });

          logger.info(`Distributed ${distribution.amount} USDC to ${distribution.recipient}`);
        } catch (error) {
          logger.error(`Failed to distribute to ${distribution.recipient}:`, error);
          
          // Mark as failed
          await prisma.paymentDistribution.updateMany({
            where: {
              paymentId,
              recipient: distribution.recipient,
              type: distribution.type,
            },
            data: { status: 'failed' },
          });
        }
      }

      logger.info(`Payment distribution completed for payment ${paymentId}`);
    } catch (error) {
      logger.error('Error distributing payment:', error);
      throw error;
    }
  }

  async getWalletBalance(walletId: string): Promise<any> {
    try {
      const wallet = await this.coinbase.getWallet(walletId);
      const balances = await wallet.listBalances();
      return balances;
    } catch (error) {
      logger.error('Error getting wallet balance:', error);
      throw error;
    }
  }

  async getPlatformWalletAddress(): Promise<string> {
    if (!this.platformWallet) {
      await this.initializePlatformWallet();
    }
    
    const addresses = await this.platformWallet!.listAddresses();
    return addresses[0].getId();
  }
}