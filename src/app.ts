import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';

// Import dependencies
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';

const app = express();
const prisma = new PrismaClient();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP',
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: config.nodeEnv,
  });
});

// Authentication middleware
const authenticate = async (req: any, res: any, next: any) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication token required' });
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as any;
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, walletId: true, walletAddress: true },
      });

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      req.user = user;
      next();
    } catch (jwtError) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Authentication error' });
  }
};

// Validation helper
const validateEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// =============================================================================
// AUTH ROUTES
// =============================================================================

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        walletId: true,
        walletAddress: true,
        createdAt: true,
      },
    });

    // Generate token
    const token = jwt.sign(
      { userId: user.id },
      config.jwt.secret,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user,
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id },
      config.jwt.secret,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        walletId: user.walletId,
        walletAddress: user.walletAddress,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Generate nonce for wallet authentication
app.post('/api/auth/nonce', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json({ error: 'Address required' });
    }

    // Generate random nonce
    const nonce = Math.floor(Math.random() * 1000000).toString();
    
    // In production, store nonce temporarily (use Redis or database)
    // For demo, we'll just return it
    res.json({ nonce });
  } catch (error) {
    logger.error('Nonce generation error:', error);
    res.status(500).json({ error: 'Failed to generate nonce' });
  }
});

// Wallet login
app.post('/api/auth/wallet-login', async (req, res) => {
  try {
    const { address, message, signature } = req.body;

    if (!address || !message || !signature) {
      return res.status(400).json({ error: 'Address, message, and signature required' });
    }

    // Verify signature
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      
      if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } catch (error) {
      return res.status(401).json({ error: 'Signature verification failed' });
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { walletAddress: address.toLowerCase() },
    });

    if (!user) {
      // Create new user with wallet address
      user = await prisma.user.create({
        data: {
          email: `${address.toLowerCase()}@wallet.local`,
          password: '', // No password for wallet users
          walletAddress: address.toLowerCase(),
        },
      });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id },
      config.jwt.secret,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        walletId: user.walletId,
        walletAddress: user.walletAddress,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    logger.error('Wallet login error:', error);
    res.status(500).json({ error: 'Wallet login failed' });
  }
});

// Get profile
app.get('/api/auth/profile', authenticate, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        walletId: true,
        walletAddress: true,
        createdAt: true,
      },
    });

    res.json(user);
  } catch (error) {
    logger.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// =============================================================================
// ANALYSIS ROUTES
// =============================================================================

// Get analysis types
app.get('/api/analysis/types', (req, res) => {
  const analysisTypes = [
    {
      type: 'BASIC_OVERVIEW',
      name: 'Basic Overview',
      description: 'Current price, market cap, and short-term outlook',
      price: config.pricing.basicOverview,
      duration: '2-3 minutes',
    },
    {
      type: 'TECHNICAL_ANALYSIS',
      name: 'Technical Analysis',
      description: 'Chart patterns, indicators, and entry/exit points',
      price: config.pricing.technicalAnalysis,
      duration: '5-7 minutes',
    },
    {
      type: 'FUNDAMENTAL_ANALYSIS',
      name: 'Fundamental Analysis',
      description: 'Project fundamentals, tokenomics, and long-term value',
      price: config.pricing.fundamentalAnalysis,
      duration: '7-10 minutes',
    },
    {
      type: 'PORTFOLIO_REVIEW',
      name: 'Portfolio Review',
      description: 'Portfolio composition, diversification, and rebalancing',
      price: config.pricing.portfolioReview,
      duration: '8-12 minutes',
    },
    {
      type: 'MARKET_SENTIMENT',
      name: 'Market Sentiment',
      description: 'Social sentiment, news analysis, and market psychology',
      price: config.pricing.marketSentiment,
      duration: '4-6 minutes',
    },
    {
      type: 'DEFI_OPPORTUNITIES',
      name: 'DeFi Opportunities',
      description: 'Yield farming, staking, and DeFi protocol analysis',
      price: config.pricing.defiOpportunities,
      duration: '10-15 minutes',
    },
  ];

  res.json(analysisTypes);
});

// Create analysis request
app.post('/api/analysis', authenticate, async (req: any, res) => {
  try {
    const { type, parameters } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get price for analysis type
    const price = config.pricing[type as keyof typeof config.pricing];
    if (!price) {
      return res.status(400).json({ error: 'Invalid analysis type' });
    }

    // Create analysis record
    const analysis = await prisma.analysis.create({
      data: {
        userId,
        type,
        parameters,
        status: 'PENDING_PAYMENT',
        price,
      },
    });

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        userId,
        amount: price,
        currency: 'USD',
        status: 'PENDING',
      },
    });
    
    // Link payment to analysis
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: { paymentId: payment.id },
    });

    res.json({
      analysisId: analysis.id,
      paymentId: payment.id,
      price,
      status: 'pending_payment',
    });
  } catch (error) {
    logger.error('Error creating analysis request:', error);
    res.status(500).json({ error: 'Failed to create analysis request' });
  }
});

// Get analysis by ID
app.get('/api/analysis/:analysisId', authenticate, async (req: any, res) => {
  try {
    const { analysisId } = req.params;
    const userId = req.user?.id;

    const analysis = await prisma.analysis.findFirst({
      where: {
        id: analysisId,
        userId, // Ensure user can only access their own analyses
      },
      include: {
        payment: true,
      },
    });

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    res.json(analysis);
  } catch (error) {
    logger.error('Error getting analysis:', error);
    res.status(500).json({ error: 'Failed to get analysis' });
  }
});

// Process analysis (generate results)
app.post('/api/analysis/:analysisId/process', authenticate, async (req: any, res) => {
  try {
    const { analysisId } = req.params;

    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      include: { payment: true },
    });

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    if (analysis.payment?.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    // Update status to processing
    await prisma.analysis.update({
      where: { id: analysisId },
      data: { status: 'PROCESSING' },
    });

    // Generate mock analysis result for demo
    const mockCryptoData = {
      symbol: analysis.parameters.symbol || 'BTC',
      name: 'Bitcoin',
      price: 43250.75,
      marketCap: 847250000000,
      volume24h: 25470000000,
      change24h: 2.45,
      change7d: -1.23,
      change30d: 8.67,
      rank: 1,
    };

    const mockMarketData = {
      totalMarketCap: 1750000000000,
      totalVolume: 85000000000,
      btcDominance: 48.5,
      ethDominance: 17.2,
      fearGreedIndex: 62,
    };

    const mockAnalysis = generateMockAnalysis(analysis.type, analysis.parameters);
    const mockSummary = generateMockSummary(analysis.type);

    // Save completed result
    const completedAnalysis = await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: 'COMPLETED',
        result: {
          fullAnalysis: mockAnalysis,
          executiveSummary: mockSummary,
          cryptoData: mockCryptoData,
          marketData: mockMarketData,
          generatedAt: new Date().toISOString(),
        },
        completedAt: new Date(),
      },
    });

    res.json({
      analysisId: completedAnalysis.id,
      status: 'completed',
      result: completedAnalysis.result,
    });
  } catch (error) {
    logger.error('Error processing analysis:', error);
    
    // Update analysis status to failed
    await prisma.analysis.update({
      where: { id: req.params.analysisId },
      data: { status: 'FAILED' },
    }).catch(() => {});

    res.status(500).json({ error: 'Failed to process analysis' });
  }
});

// Get user's analyses
app.get('/api/analysis/user', authenticate, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const { page = 1, limit = 10 } = req.query;

    const analyses = await prisma.analysis.findMany({
      where: { userId },
      include: {
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });

    const total = await prisma.analysis.count({
      where: { userId },
    });

    res.json({
      analyses,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    logger.error('Error getting user analyses:', error);
    res.status(500).json({ error: 'Failed to get analyses' });
  }
});

// =============================================================================
// PAYMENT ROUTES
// =============================================================================

// Get payment status
app.get('/api/payments/:paymentId/status', authenticate, async (req: any, res) => {
  try {
    const { paymentId } = req.params;
    
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        analysis: true,
      },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(payment);
  } catch (error) {
    logger.error('Error getting payment status:', error);
    res.status(500).json({ error: 'Failed to get payment status' });
  }
});

// Mock payment completion for demo
app.post('/api/payments/:paymentId/complete', authenticate, async (req: any, res) => {
  try {
    const { paymentId } = req.params;

    // Update payment status
    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
      },
    });

    res.json({ status: 'completed', payment });
  } catch (error) {
    logger.error('Error completing payment:', error);
    res.status(500).json({ error: 'Failed to complete payment' });
  }
});

// x402pay webhook (for production)
app.post('/api/payments/webhook', async (req, res) => {
  try {
    // Handle x402pay webhook
    const { reference: paymentId, status, transaction_hash } = req.body;

    if (status === 'completed') {
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'COMPLETED',
          transactionHash: transaction_hash,
          completedAt: new Date(),
        },
      });
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Revenue dashboard
app.get('/api/payments/revenue/dashboard', authenticate, async (req: any, res) => {
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

    res.json({
      totalRevenue: totalRevenue._sum.amount || 0,
      totalAnalyses,
      revenueByType,
      recentPayments,
    });
  } catch (error) {
    logger.error('Error getting revenue dashboard:', error);
    res.status(500).json({ error: 'Failed to get revenue dashboard' });
  }
});

// =============================================================================
// WALLET ROUTES
// =============================================================================

// Create wallet
app.post('/api/wallet/create', authenticate, async (req: any, res) => {
  try {
    const userId = req.user.id;
    
    // Check if user already has a wallet
    if (req.user.walletId) {
      return res.status(400).json({ error: 'User already has a wallet' });
    }

    // For demo purposes, generate a mock wallet ID
    const mockWalletId = `wallet_${userId}_${Date.now()}`;
    
    // Update user with wallet ID
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { walletId: mockWalletId },
      select: { id: true, email: true, walletId: true, walletAddress: true, createdAt: true },
    });

    logger.info(`Created wallet ${mockWalletId} for user ${userId}`);
    
    res.json({
      walletId: mockWalletId,
      address: `0x${Math.random().toString(16).substr(2, 40)}`, // Mock address
      user: updatedUser,
    });
  } catch (error) {
    logger.error('Error creating wallet:', error);
    res.status(500).json({ error: 'Failed to create wallet' });
  }
});

// Get wallet balance
app.get('/api/wallet/:walletId/balance', authenticate, async (req: any, res) => {
  try {
    const { walletId } = req.params;
    
    // Verify user owns this wallet
    if (req.user.walletId !== walletId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Mock balance data for demo
    const mockBalances = [
      { asset: 'USDC', amount: (Math.random() * 1000).toFixed(2) },
      { asset: 'ETH', amount: (Math.random() * 10).toFixed(4) },
    ];
    
    res.json({ balances: mockBalances });
  } catch (error) {
    logger.error('Error getting wallet balance:', error);
    res.status(500).json({ error: 'Failed to get wallet balance' });
  }
});

// Get platform wallet address
app.get('/api/wallet/platform/address', async (req, res) => {
  try {
    // Mock platform wallet address
    const platformAddress = '0x1234567890123456789012345678901234567890';
    res.json({ address: platformAddress });
  } catch (error) {
    logger.error('Error getting platform address:', error);
    res.status(500).json({ error: 'Failed to get platform address' });
  }
});

// =============================================================================
// MOCK DATA GENERATORS
// =============================================================================

function generateMockAnalysis(type: string, parameters: any): string {
  const symbol = parameters.symbol || 'BTC';
  
  switch (type) {
    case 'TECHNICAL_ANALYSIS':
      return `# Technical Analysis: ${symbol}

## Current Market Structure
${symbol} is currently trading in a **bullish ascending triangle pattern** with strong support at $42,800 and resistance at $44,200. The technical indicators suggest continued upward momentum.

## Key Technical Indicators
- **RSI (14)**: 58.4 - Neutral to slightly bullish territory
- **MACD**: Bullish crossover confirmed on 4H timeframe
- **Moving Averages**: Price above 20, 50, and 200 EMA
- **Volume**: Above average volume supporting the move

## Entry/Exit Strategy
- **Entry Point**: $43,000 - $43,200 (current support zone)
- **Target 1**: $44,500 (immediate resistance break)
- **Target 2**: $46,800 (measured move from triangle)
- **Stop Loss**: $42,500 (below key support)

## Risk Assessment
The risk/reward ratio is favorable at 1:2.5. Market sentiment remains cautiously optimistic with institutional interest continuing to drive demand.`;

    case 'FUNDAMENTAL_ANALYSIS':
      return `# Fundamental Analysis: ${symbol}

## Project Overview
Bitcoin maintains its position as the leading cryptocurrency with strong fundamentals and growing institutional adoption.

## Network Health
- **Hash Rate**: All-time highs indicating strong network security
- **Active Addresses**: Steady growth in on-chain activity
- **Transaction Volume**: Consistent $10B+ daily settlement
- **Lightning Network**: Expanding rapidly for micro-payments

## Institutional Adoption
- Multiple ETF approvals driving institutional inflows
- Corporate treasury adoption continuing
- Payment processor integration expanding globally

## Macroeconomic Factors
Current macroeconomic environment supports digital assets as inflation hedge and portfolio diversification tool.

## Long-term Outlook
Fundamental score: **82/100** - Strong long-term value proposition with increasing mainstream adoption.`;

    case 'BASIC_OVERVIEW':
      return `# ${symbol} Market Overview

## Current Status
${symbol} is showing **positive momentum** with a 2.45% gain in the last 24 hours. Trading volume is above average, indicating healthy market interest.

## Key Metrics
- **Market Cap Rank**: #1
- **24h High/Low**: $44,120 / $42,890
- **7-day Performance**: -1.23% (slight consolidation)
- **30-day Performance**: +8.67% (strong monthly gains)

## Market Sentiment
Current market sentiment is **cautiously bullish** with fear & greed index at 62 (Greed territory).

## Short-term Outlook
Next 1-4 weeks likely to see continued consolidation around current levels with potential for breakout above $44,500.`;

    default:
      return `# ${type.replace('_', ' ')} Analysis: ${symbol}

This is a comprehensive analysis generated by our AI system using Amazon Bedrock technology. The analysis incorporates real-time market data, technical indicators, and fundamental metrics to provide actionable insights.

## Key Findings
- Market conditions are showing positive indicators
- Technical analysis suggests potential upward movement
- Fundamental factors support current valuation
- Risk factors are manageable at current levels

## Recommendations
Based on current market conditions and analysis parameters, we recommend a measured approach to position sizing with appropriate risk management strategies.`;
  }
}

function generateMockSummary(type: string): string {
  switch (type) {
    case 'TECHNICAL_ANALYSIS':
      return 'Technical indicators show bullish momentum with RSI at 58.4 and MACD confirming upward trend. Entry recommended at $43,000-$43,200 with targets at $44,500 and $46,800. Risk/reward ratio of 1:2.5 makes this an attractive setup for medium-term traders.';
    
    case 'FUNDAMENTAL_ANALYSIS':
      return 'Strong fundamental score of 82/100 driven by increasing institutional adoption, network security at all-time highs, and expanding Lightning Network. Long-term outlook remains highly positive with growing mainstream acceptance and macroeconomic tailwinds.';
    
    case 'BASIC_OVERVIEW':
      return 'Currently showing positive momentum with 2.45% daily gains and healthy trading volume. Market sentiment is cautiously bullish (F&G: 62). Short-term outlook suggests consolidation with potential breakout above $44,500 in the next 1-4 weeks.';
    
    default:
      return 'Analysis complete with positive indicators across multiple timeframes. Current market conditions support measured position sizing with appropriate risk management. Key levels and targets have been identified for optimal entry and exit strategies.';
  }
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
  });
});

// Error handling middleware
app.use((error: any, req: any, res: any, next: any) => {
  logger.error('Error occurred:', {
    message: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  const status = error.status || error.statusCode || 500;
  const message = error.message || 'Internal server error';

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
});

export default app;