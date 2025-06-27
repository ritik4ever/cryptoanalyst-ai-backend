import axios from 'axios';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

export interface CryptoData {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  volume24h: number;
  change24h: number;
  change7d: number;
  change30d: number;
  circulatingSupply: number;
  totalSupply: number;
  maxSupply?: number;
  rank: number;
}

export interface MarketData {
  totalMarketCap: number;
  totalVolume: number;
  btcDominance: number;
  ethDominance: number;
  marketCapChange24h: number;
  volumeChange24h: number;
  fearGreedIndex?: number;
}

export class DataService {
  async getCryptoData(symbol: string): Promise<CryptoData> {
    try {
      // Use CoinMarketCap API for primary data
      const response = await axios.get(
        'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest',
        {
          params: { symbol: symbol.toUpperCase() },
          headers: {
            'X-CMC_PRO_API_KEY': config.external.coinmarketcapApiKey,
          },
        }
      );

      const data = response.data.data[symbol.toUpperCase()];
      
      return {
        symbol: data.symbol,
        name: data.name,
        price: data.quote.USD.price,
        marketCap: data.quote.USD.market_cap,
        volume24h: data.quote.USD.volume_24h,
        change24h: data.quote.USD.percent_change_24h,
        change7d: data.quote.USD.percent_change_7d,
        change30d: data.quote.USD.percent_change_30d,
        circulatingSupply: data.circulating_supply,
        totalSupply: data.total_supply,
        maxSupply: data.max_supply,
        rank: data.cmc_rank,
      };
    } catch (error) {
      logger.error('Error fetching crypto data from CMC:', error);
      
      // Fallback to CoinGecko
      return this.getCryptoDataFromCoinGecko(symbol);
    }
  }

  private async getCryptoDataFromCoinGecko(symbol: string): Promise<CryptoData> {
    try {
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/coins/${symbol.toLowerCase()}`,
        {
          headers: {
            'x-cg-demo-api-key': config.external.coingeckoApiKey,
          },
        }
      );

      const data = response.data;
      
      return {
        symbol: data.symbol.toUpperCase(),
        name: data.name,
        price: data.market_data.current_price.usd,
        marketCap: data.market_data.market_cap.usd,
        volume24h: data.market_data.total_volume.usd,
        change24h: data.market_data.price_change_percentage_24h,
        change7d: data.market_data.price_change_percentage_7d,
        change30d: data.market_data.price_change_percentage_30d,
        circulatingSupply: data.market_data.circulating_supply,
        totalSupply: data.market_data.total_supply,
        maxSupply: data.market_data.max_supply,
        rank: data.market_cap_rank,
      };
    } catch (error) {
      logger.error('Error fetching crypto data from CoinGecko:', error);
      throw new Error('Failed to fetch cryptocurrency data');
    }
  }

  async getMarketData(): Promise<MarketData> {
    try {
      const response = await axios.get(
        'https://pro-api.coinmarketcap.com/v1/global-metrics/quotes/latest',
        {
          headers: {
            'X-CMC_PRO_API_KEY': config.external.coinmarketcapApiKey,
          },
        }
      );

      const data = response.data.data;
      
      return {
        totalMarketCap: data.quote.USD.total_market_cap,
        totalVolume: data.quote.USD.total_volume_24h,
        btcDominance: data.btc_dominance,
        ethDominance: data.eth_dominance,
        marketCapChange24h: data.quote.USD.total_market_cap_yesterday_percentage_change,
        volumeChange24h: data.quote.USD.total_volume_24h_yesterday_percentage_change,
      };
    } catch (error) {
      logger.error('Error fetching market data:', error);
      throw new Error('Failed to fetch market data');
    }
  }

  async getFearGreedIndex(): Promise<number> {
    try {
      const response = await axios.get('https://api.alternative.me/fng/');
      return parseInt(response.data.data[0].value);
    } catch (error) {
      logger.warn('Could not fetch Fear & Greed index:', error);
      return 50; // Neutral value as fallback
    }
  }

  async getHistoricalData(symbol: string, days: number = 30): Promise<any[]> {
    try {
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/coins/${symbol.toLowerCase()}/market_chart`,
        {
          params: {
            vs_currency: 'usd',
            days,
            interval: days > 90 ? 'daily' : 'hourly',
          },
          headers: {
            'x-cg-demo-api-key': config.external.coingeckoApiKey,
          },
        }
      );

      return response.data.prices.map(([timestamp, price]: [number, number]) => ({
        timestamp,
        price,
        date: new Date(timestamp).toISOString(),
      }));
    } catch (error) {
      logger.error('Error fetching historical data:', error);
      return [];
    }
  }

  async getOnChainData(symbol: string): Promise<any> {
    try {
      // This would integrate with on-chain data providers like Nansen, Dune, etc.
      // For demo purposes, return mock data
      return {
        activeAddresses: Math.floor(Math.random() * 100000),
        transactionCount: Math.floor(Math.random() * 1000000),
        networkValue: Math.floor(Math.random() * 10000000000),
        developerActivity: Math.floor(Math.random() * 100),
      };
    } catch (error) {
      logger.error('Error fetching on-chain data:', error);
      return {};
    }
  }
}