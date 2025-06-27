import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  database: {
    url: process.env.DATABASE_URL!,
  },
  
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    region: process.env.AWS_REGION || 'us-east-1',
  },
  
  coinbase: {
    apiKey: process.env.CDP_API_KEY!,
    apiSecret: process.env.CDP_API_SECRET!,
    webhookSecret: process.env.CDP_WEBHOOK_SECRET!,
  },
  
  x402: {
    apiKey: process.env.X402_API_KEY!,
    endpoint: process.env.X402_ENDPOINT || 'https://api.x402.pay',
  },
  
  external: {
    coinmarketcapApiKey: process.env.COINMARKETCAP_API_KEY!,
    coingeckoApiKey: process.env.COINGECKO_API_KEY!,
  },
  
  jwt: {
    secret: process.env.JWT_SECRET!,
  },
  
  pricing: {
    basicOverview: 10,
    technicalAnalysis: 25,
    fundamentalAnalysis: 35,
    portfolioReview: 45,
    marketSentiment: 20,
    defiOpportunities: 50,
  },
  
  distribution: {
    platform: 0.60,
    dataProviders: 0.25,
    researchers: 0.15,
  },
};

// Validate required environment variables
const requiredEnvVars = [
  'DATABASE_URL',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'CDP_API_KEY',
  'CDP_API_SECRET',
  'X402_API_KEY',
  'JWT_SECRET',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}