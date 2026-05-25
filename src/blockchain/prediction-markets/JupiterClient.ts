import { Logger } from '../../core/utils/Logger';

export interface JupiterQuote {
  inAmount: string;
  outAmount: string;
  route: any;
  slippage: number;
  fee: number;
  priceImpact: number;
}

export interface JupiterRoute {
  id: string;
  inAmount: string;
  outAmount: string;
  steps: JupiterStep[];
  swapCount: number;
}

export interface JupiterStep {
  protocol: string;
  fromToken: string;
  toToken: string;
  poolAddress: string;
  amount: string;
}

export class JupiterClient {
  private logger: Logger;
  private baseUrl: string;

  constructor() {
    this.baseUrl = 'https://quote-api.jup.ag/v6';
    this.logger = new Logger('JupiterClient');
  }

  private async api(endpoint: string, body?: any): Promise<any> {
    const options: any = { headers: { 'Content-Type': 'application/json' } };
    if (body) { options.method = 'POST'; options.body = JSON.stringify(body); }
    const response = await fetch(`${this.baseUrl}${endpoint}`, options);
    return await response.json();
  }

  async getQuote(inputMint: string, outputMint: string, amount: string, slippageBps: number = 50): Promise<JupiterQuote | null> {
    try {
      const data = await this.api(`/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`);
      if (!data) return null;
      return this.parseQuote(data);
    } catch { return null; }
  }

  private parseQuote(data: any): JupiterQuote {
    return {
      inAmount: data.inAmount || '0',
      outAmount: data.outAmount || '0',
      route: data.routePlan || [],
      slippage: data.slippageBps || 0,
      fee: data.fee || 0,
      priceImpact: data.priceImpactPct || 0,
    };
  }

  async getRoutes(inputMint: string, outputMint: string, amount: string): Promise<JupiterRoute[]> {
    try {
      const data = await this.api(`/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}`);
      if (!data) return [];
      return [{
        id: `route-${Date.now()}`,
        inAmount: data.inAmount || '0',
        outAmount: data.outAmount || '0',
        steps: (data.routePlan || []).map((step: any) => ({
          protocol: step.pool || 'unknown',
          fromToken: inputMint,
          toToken: outputMint,
          poolAddress: step.pool || '',
          amount: data.inAmount || '0',
        })),
        swapCount: data.routePlan?.length || 0,
      }];
    } catch { return []; }
  }

  async getTokenList(): Promise<any[]> {
    try {
      const data = await this.api('/tokens');
      return data || [];
    } catch { return []; }
  }

  async getPrice(tokenAddress: string): Promise<number | null> {
    try {
      const quotes = await this.getQuote(
        tokenAddress,
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        '1000000',
      );
      if (!quotes) return null;
      return 1 / (parseFloat(quotes.outAmount) / 1000000);
    } catch { return null; }
  }

  async getIndexedRoutes(inputMint: string, outputMint: string, amount: string): Promise<any[]> {
    try {
      return await this.api(`/indexed-route?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}`) || [];
    } catch { return []; }
  }
}