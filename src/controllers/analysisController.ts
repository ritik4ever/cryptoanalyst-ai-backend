import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { BedrockService } from '../services/bedrockService.js';
import { DataService } from '../services/dataService.js';
import { PaymentService } from '../services/paymentService.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const prisma = new PrismaClient();
const bedrockService = new BedrockService();
const dataService = new DataService();
const paymentService = new PaymentService();

export const createAnalysisRequest = async (req: Request, res: Response) => {
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

    // Create payment
    const paymentId = await paymentService.createPayment(userId, type, price);
    
    // Link payment to analysis
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: { paymentId },
    });

    res.json({
      analysisId: analysis.id,
      paymentId,
      price,
      status: 'pending_payment',
    });
  } catch (error) {
    logger.error('Error creating analysis request:', error);
    res.status(500).json({ error: 'Failed to create analysis request' });
  }
};

export const processAnalysis = async (req: Request, res: Response) => {
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

    if (analysis.status !== 'PROCESSING') {
      await prisma.analysis.update({
        where: { id: analysisId },
        data: { status: 'PROCESSING' },
      });
    }

    // Get crypto and market data
    const symbol = analysis.parameters.symbol || 'BTC';
    const [cryptoData, marketData] = await Promise.all([
      dataService.getCryptoData(symbol),
      dataService.getMarketData(),
    ]);

    // Add Fear & Greed index
    const fearGreedIndex = await dataService.getFearGreedIndex();
    const enhancedMarketData = { ...marketData, fearGreedIndex };

    // Generate analysis using Bedrock
    const analysisResult = await bedrockService.generateAnalysis(
      analysis.type,
      cryptoData,
      enhancedMarketData,
      analysis.parameters
    );

    // Generate executive summary
    const executiveSummary = await bedrockService.generateExecutiveSummary(analysisResult);

    // Save result
    const completedAnalysis = await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: 'COMPLETED',
        result: {
          fullAnalysis: analysisResult,
          executiveSummary,
          cryptoData,
          marketData: enhancedMarketData,
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
    });

    res.status(500).json({ error: 'Failed to process analysis' });
  }
};

export const getAnalysis = async (req: Request, res: Response) => {
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
};

export const getUserAnalyses = async (req: Request, res: Response) => {
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
};

export const getAnalysisTypes = async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    logger.error('Error getting analysis types:', error);
    res.status(500).json({ error: 'Failed to get analysis types' });
  }
};