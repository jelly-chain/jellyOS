import { Logger } from '../../core/utils/Logger';

export interface ManifoldMarket {
  id: string;
  question: string;
  probability: number;
  volume: number;
  closeTime: string;
  resolution: string;
  outcomes: string[];
}

export class ManifoldClient {
  private logger: Logger;
  private baseUrl = 'https://api.manifold.xyz/v0';
  private apiKey?: string;

  constructor() {
    this.logger = new Logger('ManifoldClient');
    this.apiKey = process.env.MANIFOLD_API_KEY;
  }

  async getMarkets(limit: number = 20): Promise<ManifoldMarket[]> {
    try {
      const res = await fetch(`${this.baseUrl}/markets?limit=${limit}`);
      const data = await res.json() as any;
      return (data || []).map((m: any) => ({
        id: m.id, question: m.question, probability: m.probability || 0.5,
        volume: m.volume || 0, closeTime: m.closeTime, resolution: m.resolution,
        outcomes: ['YES', 'NO'],
      }));
    } catch (e) {
      this.logger.error('Failed to fetch Manifold markets', e);
      return [];
    }
  }

  async searchMarkets(query: string): Promise<ManifoldMarket[]> {
    try {
      const res = await fetch(`${this.baseUrl}/search-markets?query=${encodeURIComponent(query)}&limit=20`);
      const data = await res.json() as any;
      return (data || []).map((m: any) => ({
        id: m.id, question: m.question, probability: m.probability || 0.5,
        volume: m.volume || 0, closeTime: m.closeTime, resolution: m.resolution,
        outcomes: ['YES', 'NO'],
      }));
    } catch { return []; }
  }

  async bet(marketId: string, outcome: 'YES' | 'NO', amount: number): Promise<any> {
    if (!this.apiKey) { this.logger.warn('MANIFOLD_API_KEY not set'); return null; }
    try {
      const res = await fetch(`${this.baseUrl}/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${this.apiKey}` },
        body: JSON.stringify({ contractId: marketId, outcome, amount }),
      });
      return await res.json();
    } catch (e) {
      this.logger.error('Failed to place Manifold bet', e);
      return null;
    }
  }

  async search(query: string): Promise<any[]> {
    return this.searchMarkets(query);
  }
}

export const manifoldClient = new ManifoldClient();