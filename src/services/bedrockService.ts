import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

export class BedrockService {
  private client: BedrockRuntimeClient;

  constructor() {
    this.client = new BedrockRuntimeClient({
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    });
  }

  async generateAnalysis(
    analysisType: string,
    cryptoData: any,
    marketData: any,
    userParameters: any
  ): Promise<string> {
    try {
      const prompt = this.buildAnalysisPrompt(analysisType, cryptoData, marketData, userParameters);
      
      // Use Amazon Nova for complex analysis
      const modelId = 'amazon.nova-pro-v1:0';
      
      const request = {
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 4000,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.1,
          top_p: 0.9
        })
      };

      const command = new InvokeModelCommand(request);
      const response = await this.client.send(command);
      
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      logger.info(`Generated ${analysisType} analysis successfully`);
      return responseBody.content[0].text;
      
    } catch (error) {
      logger.error('Error generating analysis with Bedrock:', error);
      throw new Error('Failed to generate AI analysis');
    }
  }

  private buildAnalysisPrompt(
    analysisType: string,
    cryptoData: any,
    marketData: any,
    userParameters: any
  ): string {
    const basePrompt = `
You are CryptoAnalyst AI, a professional cryptocurrency investment analysis service. 
Generate a comprehensive ${analysisType} report based on the following data:

CRYPTO DATA:
${JSON.stringify(cryptoData, null, 2)}

MARKET DATA:
${JSON.stringify(marketData, null, 2)}

USER PARAMETERS:
${JSON.stringify(userParameters, null, 2)}

Please provide a detailed, professional analysis including:
`;

    switch (analysisType) {
      case 'BASIC_OVERVIEW':
        return basePrompt + `
1. Current price and market cap summary
2. 24h/7d/30d performance analysis
3. Key support and resistance levels
4. Overall market sentiment
5. Risk assessment (1-10 scale)
6. Short-term outlook (1-4 weeks)
7. Actionable recommendations

Format as a professional investment report with clear sections and bullet points.
`;

      case 'TECHNICAL_ANALYSIS':
        return basePrompt + `
1. Chart pattern analysis
2. Moving averages (SMA, EMA) analysis
3. RSI, MACD, and momentum indicators
4. Volume analysis
5. Fibonacci retracement levels
6. Entry/exit point recommendations
7. Stop-loss and take-profit levels
8. Risk/reward ratio assessment

Include specific price targets and timeframes.
`;

      case 'FUNDAMENTAL_ANALYSIS':
        return basePrompt + `
1. Project fundamentals and technology assessment
2. Team and development activity analysis
3. Tokenomics and supply dynamics
4. Partnerships and ecosystem growth
5. Competitive landscape analysis
6. Regulatory considerations
7. Long-term value proposition
8. Investment thesis and conviction level

Provide a comprehensive fundamental score (1-100).
`;

      case 'PORTFOLIO_REVIEW':
        return basePrompt + `
1. Portfolio composition analysis
2. Diversification assessment
3. Risk distribution across assets
4. Correlation analysis between holdings
5. Rebalancing recommendations
6. Position sizing optimization
7. Performance attribution
8. Future allocation suggestions

Include specific percentage allocations and rebalancing strategy.
`;

      case 'MARKET_SENTIMENT':
        return basePrompt + `
1. Social media sentiment analysis
2. News sentiment and media coverage
3. On-chain activity patterns
4. Institutional interest indicators
5. Fear & Greed index interpretation
6. Market psychology assessment
7. Contrarian vs. trend-following signals
8. Sentiment-based trading opportunities

Provide sentiment score (-100 to +100) and implications.
`;

      case 'DEFI_OPPORTUNITIES':
        return basePrompt + `
1. DeFi protocol analysis and opportunities
2. Yield farming strategies
3. Liquidity mining programs
4. Staking rewards analysis
5. Impermanent loss calculations
6. Smart contract risk assessment
7. APY sustainability analysis
8. Portfolio DeFi allocation recommendations

Include specific protocols, APYs, and risk ratings.
`;

      default:
        return basePrompt + `
Provide a comprehensive cryptocurrency analysis covering all relevant aspects including technical, fundamental, and market considerations.
`;
    }
  }

  async generateExecutiveSummary(fullAnalysis: string): Promise<string> {
    try {
      const prompt = `
Based on the following comprehensive cryptocurrency analysis, generate a concise executive summary in 3-4 sentences that captures the key insights and recommendations:

FULL ANALYSIS:
${fullAnalysis}

EXECUTIVE SUMMARY:
`;

      const request = {
        modelId: 'amazon.nova-lite-v1:0', // Use lighter model for summary
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 200,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.1
        })
      };

      const command = new InvokeModelCommand(request);
      const response = await this.client.send(command);
      
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      return responseBody.content[0].text;
      
    } catch (error) {
      logger.error('Error generating executive summary:', error);
      throw new Error('Failed to generate executive summary');
    }
  }
}