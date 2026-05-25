export { BlockchainManager, ChainConfig } from './BlockchainManager';
export { AlchemyClient } from './clients/AlchemyClient';
export { SolanaClient } from './clients/SolanaClient';
export { CosmosClient } from './clients/CosmosClient';
export { ChainClientFactory } from './clients/Index';
export { PolymarketClient } from './prediction-markets/PolymarketClient';
export { KalshiClient } from './prediction-markets/KalshiClient';
export { JupiterClient } from './prediction-markets/JupiterClient';
export { PredictionMarketAggregator } from './prediction-markets/Index';

import { Metrics } from '../core/utils/Metrics';
import { BlockchainManager } from './BlockchainManager';
import { PredictionMarketAggregator } from './prediction-markets/Index';

export class BlockchainOrchestrator {
  private manager: BlockchainManager;
  private markets: PredictionMarketAggregator;

  constructor(metrics: Metrics) {
    this.manager = new BlockchainManager(metrics);
    this.markets = new PredictionMarketAggregator();
  }

  getManager(): BlockchainManager { return this.manager; }
  getMarkets(): PredictionMarketAggregator { return this.markets; }
  getSupportedChains(): string[] { return this.manager.getAllChains().map(c => c.name); }
}

export const createBlockchainOrchestrator = (metrics: Metrics) => new BlockchainOrchestrator(metrics);