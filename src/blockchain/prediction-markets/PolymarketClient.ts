import { Logger } from '../../core/utils/Logger';

export interface PolymarketMarket {
  id: string;
  question: string;
  outcomes: string[];
  outcomePrices: string[];
  volume: number;
  liquidity: number;
  closeTime: string;
  status: string;
}

export class PolymarketClient {
  private logger: Logger;
  private clobUrl = 'https://clob.polymarket.com';
  private gammaUrl = 'https://gamma-api.polymarket.com';
  private apiKey?: string;
  private secret?: string;

  constructor() {
    this.logger = new Logger('PolymarketClient');
    this.apiKey = process.env.POLYMARKET_API_KEY;
    this.secret = process.env.POLYMARKET_SECRET;
  }

  async getMarkets(limit: number = 20, offset: number = 0, closed: boolean = false): Promise<PolymarketMarket[]> {
    try {
      const res = await fetch(`${this.gammaUrl}/markets?limit=${limit}&offset=${offset}&closed=${closed}`);
      const data = await res.json() as any;
      return (data || []).map((m: any) => ({
        id: m.id, question: m.question,
        outcomes: m.outcomes?.map((o: any) => o.outcome) || [],
        outcomePrices: m.outcomePrices || [],
        volume: parseFloat(m.volume || '0'),
        liquidity: parseFloat(m.liquidity || '0'),
        closeTime: m.closeTime, status: m.status,
      }));
    } catch (e) {
      this.logger.error('Failed to fetch Polymarket markets', e);
      return [];
    }
  }

  async searchMarkets(query: string): Promise<PolymarketMarket[]> {
    try {
      const res = await fetch(`${this.gammaUrl}/markets?tag=${encodeURIComponent(query)}&limit=20`);
      const data = await res.json() as any;
      return (data || []).map((m: any) => ({
        id: m.id, question: m.question, outcomes: m.outcomes?.map((o: any) => o.outcome) || [],
        outcomePrices: m.outcomePrices || [], volume: parseFloat(m.volume || '0'),
        liquidity: parseFloat(m.liquidity || '0'), closeTime: m.closeTime, status: m.status,
      }));
    } catch { return []; }
  }

  async getOrderbook(tokenId: string): Promise<{ bids: any[]; asks: any[] }> {
    try {
      const res = await fetch(`${this.clobUrl}/books?token_id=${tokenId}`);
      const data = await res.json() as any;
      return { bids: data?.bids || [], asks: data?.asks || [] };
    } catch { return { bids: [], asks: [] }; }
  }

  async getPrice(marketId: string): Promise<{ yes: number; no: number }> {
    try {
      const res = await fetch(`${this.gammaUrl}/markets/${marketId}`);
      const m = await res.json() as any;
      const prices = m.outcomePrices || ['0.5', '0.5'];
      return { yes: parseFloat(prices[0]), no: parseFloat(prices[1] || '0.5') };
    } catch { return { yes: 0.5, no: 0.5 }; }
  }
}

export const polymarketClient = new PolymarketClient();