import { Logger } from '../core/utils/Logger';
import { Metrics } from '../core/utils/Metrics';
import { Position, PositionManager, PositionStatus } from './PositionManager';

export interface PortfolioSummary {
  totalValue: number;
  cash: number;
  allocated: number;
  positions: number;
  diversification: number;
  concentration: Record<string, number>;
  exposure: { long: number; short: number; net: number };
  performance: {
    totalReturn: number;
    dailyReturn: number;
    weeklyReturn: number;
    monthlyReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
  };
  timestamp: number;
}

export interface AllocationStrategy {
  type: 'equal' | 'weighted' | 'risk-parity' | 'momentum';
  weights?: Record<string, number>;
  maxPositionSize: number;
  minPositionSize: number;
  rebalanceThreshold: number;
}

export class PortfolioManager {
  private logger: Logger;
  private metrics: Metrics;
  private positionManager: PositionManager;
  private config: AllocationStrategy;
  private cashReserve: number;

  constructor(
    positionManager: PositionManager,
    metrics: Metrics,
    initialCapital: number = 100000,
    config?: Partial<AllocationStrategy>,
  ) {
    this.positionManager = positionManager;
    this.metrics = metrics;
    this.logger = new Logger('PortfolioManager');
    this.cashReserve = initialCapital;
    this.config = {
      type: 'risk-parity', maxPositionSize: 0.2, minPositionSize: 0.02, rebalanceThreshold: 0.05,
      ...config,
    };
  }

  getSummary(): PortfolioSummary {
    const positions = this.positionManager.getOpenPositions();
    const closedPositions = this.positionManager.getClosedPositions();
    const totalAllocated = positions.reduce((s, p) => s + p.currentPrice * p.quantity, 0);
    const totalValue = this.cashReserve + totalAllocated;
    const unrealizedPnL = positions.reduce((s, p) => s + p.unrealizedPnL, 0);
    const realizedPnL = closedPositions.reduce((s, p) => s + p.realizedPnL, 0);
    const totalReturn = (realizedPnL + unrealizedPnL) / (totalValue - realizedPnL - unrealizedPnL);

    const concentration: Record<string, number> = {};
    for (const pos of positions) {
      concentration[pos.symbol] = totalValue > 0 ? (pos.currentPrice * pos.quantity) / totalValue : 0;
    }

    const longExposure = positions.filter(p => p.side === 'long').reduce((s, p) => s + p.currentPrice * p.quantity, 0);
    const shortExposure = positions.filter(p => p.side === 'short').reduce((s, p) => s + p.currentPrice * p.quantity, 0);
    const uniqueSymbols = new Set(positions.map(p => p.symbol)).size;
    const diversification = positions.length > 0 ? uniqueSymbols / positions.length : 0;

    const wins = closedPositions.filter(p => p.realizedPnL > 0).length;
    const losses = closedPositions.filter(p => p.realizedPnL < 0).length;
    const winRate = wins + losses > 0 ? wins / (wins + losses) : 0;
    const avgWin = wins > 0 ? closedPositions.filter(p => p.realizedPnL > 0).reduce((s, p) => s + p.realizedPnL, 0) / wins : 0;
    const avgLoss = losses > 0 ? Math.abs(closedPositions.filter(p => p.realizedPnL < 0).reduce((s, p) => s + p.realizedPnL, 0)) / losses : 0;

    return {
      totalValue, cash: this.cashReserve, allocated: totalAllocated,
      positions: positions.length, diversification, concentration,
      exposure: { long: longExposure, short: shortExposure, net: longExposure - shortExposure },
      performance: {
        totalReturn, dailyReturn: totalReturn / 365, weeklyReturn: totalReturn / 52,
        monthlyReturn: totalReturn / 12, sharpeRatio: totalReturn > 0 ? 0.5 : 0, maxDrawdown: 0,
      },
      timestamp: Date.now(),
    };
  }

  calculateAllocation(symbol: string, price: number, score: number): number {
    const maxAllocation = this.cashReserve * this.config.maxPositionSize;
    const minAllocation = this.cashReserve * this.config.minPositionSize;

    if (this.config.type === 'equal') {
      const positionCount = this.positionManager.getOpenPositions().length + 1;
      return Math.min(maxAllocation, this.cashReserve / positionCount);
    }

    if (this.config.type === 'momentum') {
      const normalizedScore = Math.max(0, Math.min(1, (score + 1) / 2));
      return Math.max(minAllocation, Math.min(maxAllocation, this.cashReserve * normalizedScore * 0.1));
    }

    return Math.max(minAllocation, Math.min(maxAllocation, this.cashReserve * 0.1));
  }

  checkRebalanceNeeded(): boolean {
    const summary = this.getSummary();
    if (summary.positions === 0) return false;

    for (const [, weight] of Object.entries(summary.concentration)) {
      if (Math.abs(weight - (this.config.weights?.['default'] || 0.1)) > this.config.rebalanceThreshold) {
        return true;
      }
    }
    return false;
  }

  addCash(amount: number): void { this.cashReserve += amount; }
  deductCash(amount: number): void { this.cashReserve = Math.max(0, this.cashReserve - amount); }
  getCash(): number { return this.cashReserve; }
  setAllocationStrategy(strategy: Partial<AllocationStrategy>): void { this.config = { ...this.config, ...strategy }; }
}