import { Logger } from '../../core/utils/Logger';

import { KalshiClient, KalshiEvent, KalshiMarket } from './KalshiClient';
import { PolymarketClient, PolymarketMarket } from './PolymarketClient';
import { JupiterClient, JupiterQuote, JupiterRoute, JupiterStep } from './JupiterClient';
import { ManifoldClient, ManifoldMarket } from './ManifoldClient';
export { KalshiClient, KalshiEvent, KalshiMarket } from './KalshiClient';
export { PolymarketClient, PolymarketMarket } from './PolymarketClient';
export { JupiterClient, JupiterQuote, JupiterRoute, JupiterStep } from './JupiterClient';
export { ManifoldClient, ManifoldMarket } from './ManifoldClient';

export class PredictionMarketAggregator {
  private polymarket: PolymarketClient;
  private kalshi: KalshiClient;
  private jupiter: JupiterClient;
  private manifold: ManifoldClient;

  constructor() {
    this.polymarket = new PolymarketClient();
    this.kalshi = new KalshiClient();
    this.jupiter = new JupiterClient();
    this.manifold = new ManifoldClient();
  }

  getPolymarket(): PolymarketClient { return this.polymarket; }
  getKalshi(): KalshiClient { return this.kalshi; }
  getJupiter(): JupiterClient { return this.jupiter; }
  getManifold(): ManifoldClient { return this.manifold; }

  async getAllMarkets(): Promise<any[]> {
    const [polymarkets, kalshiEvents, manifoldMarkets] = await Promise.all([
      this.polymarket.getMarkets().catch(() => []),
      this.kalshi.getEvents().catch(() => []),
      this.manifold.getMarkets().catch(() => []),
    ]);
    return [
      ...polymarkets,
      ...kalshiEvents.flatMap(e => e.markets),
      ...manifoldMarkets
    ];
  }

  async getTopVolume(limit: number = 20): Promise<any[]> {
    const markets = await this.getAllMarkets();
    return markets.sort((a, b) => {
      const aVol = parseFloat(a.volume || a.volume || '0');
      const bVol = parseFloat(b.volume || b.volume || '0');
      return bVol - aVol;
    }).slice(0, limit);
  }
}

export const createAggregator = () => new PredictionMarketAggregator();