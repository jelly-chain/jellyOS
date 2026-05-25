export { TradeExecutor, TradeOrder, Fill, TradeStatus, ExecutionConfig } from './TradeExecutor';
export { PositionManager, Position, PositionStatus, PositionConfig } from './PositionManager';
export { PortfolioManager, PortfolioSummary, AllocationStrategy } from './PortfolioManager';
export { RiskManager, RiskLimit, RiskCheck } from './RiskManager';

import { ContextStore } from '../context/ContextStore';
import { Metrics } from '../core/utils/Metrics';
import { TradeExecutor } from './TradeExecutor';
import { PositionManager } from './PositionManager';
import { PortfolioManager } from './PortfolioManager';
import { RiskManager } from './RiskManager';

export class TradingEngine {
  private tradeExecutor: TradeExecutor;
  private positionManager: PositionManager;
  private portfolioManager: PortfolioManager;
  private riskManager: RiskManager;
  private logger: any;

  constructor(context: ContextStore, metrics: Metrics, initialCapital?: number) {
    this.positionManager = new PositionManager(metrics);
    this.portfolioManager = new PortfolioManager(this.positionManager, metrics, initialCapital);
    this.riskManager = new RiskManager(this.positionManager, metrics);
    this.tradeExecutor = new TradeExecutor(context, metrics);
    this.logger = { info: (msg: string) => console.log(`[TradingEngine] ${msg}`) };
  }

  getTradeExecutor(): TradeExecutor { return this.tradeExecutor; }
  getPositionManager(): PositionManager { return this.positionManager; }
  getPortfolioManager(): PortfolioManager { return this.portfolioManager; }
  getRiskManager(): RiskManager { return this.riskManager; }
}

export const createTradingEngine = (context: ContextStore, metrics: Metrics, capital?: number) => new TradingEngine(context, metrics, capital);