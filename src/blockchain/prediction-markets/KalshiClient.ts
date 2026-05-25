import * as crypto from 'crypto';
import { Logger } from '../../core/utils/Logger';

export interface KalshiEvent {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  openTime: string;
  closeTime: string;
  markets: KalshiMarket[];
}

export interface KalshiMarket {
  id: string;
  title: string;
  subtitle: string;
  yesAsk: number;
  yesBid: number;
  noAsk: number;
  noBid: number;
  volume: number;
  openInterest: number;
}

export class KalshiClient {
  private logger: Logger;
  private baseUrl: string;

  constructor() {
    this.baseUrl = 'https://trading-api.kalshi.com/trade-api/v2';
    this.logger = new Logger('KalshiClient');
  }

  private async api(endpoint: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    return await response.json();
  }

  async getEvents(status?: string): Promise<KalshiEvent[]> {
    const params = status ? `?status=${status}` : '';
    const data = await this.api(`/events${params}`);
    return (data?.events || []).map((e: any) => ({
      id: e.id, title: e.title, subtitle: e.subtitle,
      status: e.status, openTime: e.open_time, closeTime: e.close_time,
      markets: (e.markets || []).map((m: any) => ({
        id: m.id || m.ticker, title: m.title, subtitle: m.subtitle,
        yesAsk: m.yes_ask || 0, yesBid: m.yes_bid || 0,
        noAsk: m.no_ask || 0, noBid: m.no_bid || 0,
        volume: m.volume || 0, openInterest: m.open_interest || 0,
      })),
    }));
  }

  async getMarket(marketId: string): Promise<KalshiMarket | null> {
    try {
      const data = await this.api(`/markets/${marketId}`);
      const m = data?.market;
      if (!m) return null;
      return {
        id: m.id || m.ticker, title: m.title, subtitle: m.subtitle,
        yesAsk: m.yes_ask || 0, yesBid: m.yes_bid || 0,
        noAsk: m.no_ask || 0, noBid: m.no_bid || 0,
        volume: m.volume || 0, openInterest: m.open_interest || 0,
      };
    } catch { return null; }
  }

  async getMarketHistory(marketId: string): Promise<any[]> {
    try { return await this.api(`/markets/${marketId}/history`) || []; }
    catch { return []; }
  }

  async getPrice(marketId: string): Promise<{ yes: number; no: number }> {
    const market = await this.getMarket(marketId);
    return market ? { yes: (market.yesAsk + market.yesBid) / 2, no: (market.noAsk + market.noBid) / 2 } : { yes: 0.5, no: 0.5 };
  }

  searchEvents(query: string): Promise<KalshiEvent[]> {
    return this.getEvents().then(events =>
      events.filter(e => e.title.toLowerCase().includes(query.toLowerCase()))
    );
  }

  private signRequest(timestamp: string, method: string, path: string): string {
    const secret = process.env.KALSHI_API_SECRET || '';
    return crypto.createHmac('sha256', secret).update(timestamp + method + path).digest('base64');
  }

  private getAuthHeaders(timestamp: string, method: string, path: string): Record<string, string> {
    const key = process.env.KALSHI_API_KEY || '';
    return {
      'KALSHI-ACCESS-KEY': key,
      'KALSHI-ACCESS-TIMESTAMP': timestamp,
      'KALSHI-ACCESS-SIGNATURE': this.signRequest(timestamp, method, path),
      'Content-Type': 'application/json',
    };
  }

  async placeOrder(ticker: string, side: 'yes' | 'no', count: number, price: number): Promise<any> {
    try {
      const body = { ticker, side, type: 'limit', yes_price: side === 'yes' ? price : undefined, no_price: side === 'no' ? price : undefined, count: String(count) };
      const timestamp = Date.now().toString();
      const res = await fetch(`${this.baseUrl}/portfolio/orders`, {
        method: 'POST', headers: this.getAuthHeaders(timestamp, 'POST', '/trade-api/v2/portfolio/orders'), body: JSON.stringify(body),
      });
      return await res.json();
    } catch (e) {
      this.logger.error('Failed to place Kalshi order', e);
      return null;
    }
  }

  async getBalance(): Promise<{ balance: number; available: number }> {
    try {
      const timestamp = Date.now().toString();
      const res = await fetch(`${this.baseUrl}/portfolio/balance`, {
        headers: this.getAuthHeaders(timestamp, 'GET', '/trade-api/v2/portfolio/balance'),
      });
      const data = await res.json() as any;
      return { balance: parseFloat(data.balance || '0'), available: parseFloat(data.available || '0') };
    } catch { return { balance: 0, available: 0 }; }
  }

  async getPositions(): Promise<any[]> {
    try {
      const timestamp = Date.now().toString();
      const res = await fetch(`${this.baseUrl}/portfolio/positions`, {
        headers: this.getAuthHeaders(timestamp, 'GET', '/trade-api/v2/portfolio/positions'),
      });
      const data = await res.json() as any;
      return data?.positions || [];
    } catch { return []; }
  }
}