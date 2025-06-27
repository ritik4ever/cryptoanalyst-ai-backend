import axios from 'axios';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { PrismaClient } from '@prisma/client';
import { WalletService } from './walletService.js';

const prisma = new PrismaClient();

export class PaymentService {
  private walletService: WalletService;

  constructor() {
    this.walletService = new WalletService();
  }

  async createPayment(userId: string, analysisType: string, amount: number): Promise<string> {
    try {
      // Create payment record
      const payment = await prisma.payment.create({
        data: {
          userId,
          amount,
          currency: 'USD',
          status: 'PENDING',
        },
      });

      // Create x402pay payment
      const x402Payment = await this.createX402Payment(payment.id, amount);
      
      // Update payment with x402 payment ID
      await prisma.payment.update({
        where: { id: payment.id },
        data: { x402PaymentId: x402Payment.id },
      });

      logger.info(`Created payment ${payment.id} for user ${userId}`);
      return payment.id;
    } catch (error) {
      logger.error('Error creating payment:', error);
      throw error;
    }
  }

  private async createX402Payment(paymentId: string, amount: number): Promise<any> {
    try {
      const response = await axios.post(
        `${config.x402.endpoint}/payments`,
        {
          amount: amount * 100, // Convert to cents
          currency: 'USD',
          reference: paymentId,
          description: 'CryptoAnalyst AI Analysis',
          success_url: `${process.env.FRONTEND_URL}/payment/success`,
          cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
          webhook_url: `${process.env.BACKEND_URL}/api/payments/webhook`,
        },
        {
          headers: {
            'Authorization': `Bearer ${config.x402.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error) {
      logger.error('Error creating x402 payment:', error);
      throw error;
    }
  }

  async handlePaymentWebhook(payload: any, signature: string): Promise<void> {
    try {
      // Verify webhook signature (implementation depends on x402pay docs)
      // const isValid = this.verifyWebhookSignature(payload, signature);
      // if (!isValid) {
      //   throw new Error('Invalid webhook signature');
      // }

      const { reference: paymentId, status, transaction_hash } = payload;

      if (status === 'completed') {
        // Update payment status
        const payment = await prisma.payment.update({
          where: { id: paymentId },
          data: {
            status: 'COMPLETED',
            transactionHash: transaction_hash,
            completedAt: new Date(),
          },
        });

        // Trigger analysis processing
        await this.processPaymentCompletion(payment);

        // Distribute payment to stakeholders
        await this.walletService.distributePayment(paymentId, payment.amount.toNumber());

        logger.info(`Payment ${paymentId} completed and distributed`);
      } else if (status === 'failed') {
        await prisma.payment.update({
          where: { id: paymentId },
          data: { status: 'FAILED' },
        });

        logger.warn(`Payment ${paymentId} failed`);
      }
    } catch (error) {
      logger.error('Error handling payment webhook:', error);
      throw error;
    }
  }

  private async processPaymentCompletion(payment: any): Promise<void> {
    try {
      // Find associated analysis
      const analysis = await prisma.analysis.findFirst({
        where: { paymentId: payment.id },
      });

      if (analysis) {
        // Update analysis status to processing
        await prisma.analysis.update({
          where: { id: analysis.id },
          data: { status: 'PROCESSING' },
        });

        // Trigger analysis generation (this would typically be done via a queue)
        // For demo purposes, we'll call it directly
        // In production, use a job queue like Bull or AWS SQS
        logger.info(`Starting analysis generation for analysis ${analysis.id}`);
      }
    } catch (error) {
      logger.error('Error processing payment completion:', error);
      throw error;
    }
  }

  async getPaymentStatus(paymentId: string): Promise<any> {
    try {
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          distributions: true,
          analysis: true,
        },
      });

      return payment;
    } catch (error) {
      logger.error('Error getting payment status:', error);
      throw error;
    }
  }

  async getRevenueDashboard(): Promise<any> {
    try {
      const totalRevenue = await prisma.payment.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      });

      const totalAnalyses = await prisma.analysis.count({
        where: { status: 'COMPLETED' },
      });

      const revenueByType = await prisma.analysis.groupBy({
        by: ['type'],
        where: { status: 'COMPLETED' },
        _sum: { price: true },
        _count: true,
      });

      const recentPayments = await prisma.payment.findMany({
        where: { status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        take: 10,
        include: {
          user: { select: { email: true } },
          analysis: { select: { type: true } },
        },
      });

      return {
        totalRevenue: totalRevenue._sum.amount || 0,
        totalAnalyses,
        revenueByType,
        recentPayments,
      };
    } catch (error) {
      logger.error('Error getting revenue dashboard:', error);
      throw error;
    }
  }
}