import { Logger } from '../core/utils/Logger';
import { Metrics } from '../core/utils/Metrics';
import { Position, PositionManager } from './PositionManager';

export interface RiskLimit {
  maxDrawdown: number;
  maxDailyLoss: number;
  maxLeverage: number;
  maxConcentration: number;
  maxPositionSize: number;
  minLiquidity: number;
}

export interface RiskCheck {
  passed: boolean;
  violations: string[];
  details: Record<string, number>;
}

export class RiskManager {
  private logger: Logger;
  private metrics: Metrics;
  private positionManager: PositionManager;
  private limits: RiskLimit;
  private dailyLoss: number = 0;
  private dailyResetTime: number = Date.now();

  constructor(
    positionManager: PositionManager,
    metrics: Metrics,
    limits?: Partial<RiskLimit>,
  ) {
    this.positionManager = positionManager;
    this.metrics = metrics;
    this.logger = new Logger('RiskManager');
    this.limits = {
      maxDrawdown: 0.2, maxDailyLoss: 0.05, maxLeverage: 3,
      maxConcentration: 0.3, maxPositionSize: 0.2, minLiquidity: 0.3,
      ...limits,
    };
  }

  canOpenPosition(symbol: string, size: number, leverage: number, portfolioValue: number): RiskCheck {
    const violations: string[] = [];
    const details: Record<string, number> = {};

    const currentPositions = this.positionManager.getPositionsBySymbol(symbol);
    const currentExposure = currentPositions.reduce((s, p) => s + p.currentPrice * p.quantity, 0);
    const newExposure = size * leverage;
    const totalNewExposure = currentExposure + newExposure;

    const concentration = portfolioValue > 0 ? totalNewExposure / portfolioValue : 0;
    details.concentration = concentration;
    if (concentration > this.limits.maxConcentration) {
      violations.push(`concentration-exceeded: ${(concentration * 100).toFixed(1)}% > ${(this.limits.maxConcentration * 100).toFixed(0)}%`);
    }

    const positionPercent = portfolioValue > 0 ? (newExposure / portfolioValue) : 0;
    details.positionPercent = positionPercent;
    if (positionPercent > this.limits.maxPositionSize) {
      violations.push(`position-size-exceeded: ${(positionPercent * 100).toFixed(1)}% > ${(this.limits.maxPositionSize * 100).toFixed(0)}%`);
    }

    details.leverage = leverage;
    if (leverage > this.limits.maxLeverage) {
      violations.push(`leverage-exceeded: ${leverage}x > ${this.limits.maxLeverage}x`);
    }

    const summary = this.getDailyReset();
    details.dailyLoss = summary.dailyLoss;
    if (summary.dailyLoss > this.limits.maxDailyLoss) {
      violations.push(`daily-loss-limit-hit: ${(summary.dailyLoss * 100).toFixed(1)}% > ${(this.limits.maxDailyLoss * 100).toFixed(0)}%`);
    }

    details.drawdown = summary.drawdown;
    if (summary.drawdown > this.limits.maxDrawdown) {
      violations.push(`drawdown-limit-hit: ${(summary.drawdown * 100).toFixed(1)}% > ${(this.limits.maxDrawdown * 100).toFixed(0)}%`);
    }

    return { passed: violations.length === 0, violations, details };
  }

  canClosePosition(position: Position): boolean {
    return true;
  }

  checkPortfolioRisk(portfolioValue: number, initialPortfolioValue: number): RiskCheck {
    const violations: string[] = [];
    const details: Record<string, number> = {};

    const drawdown = initialPortfolioValue > 0 ? (initialPortfolioValue - portfolioValue) / initialPortfolioValue : 0;
    details.drawdown = drawdown;
    if (drawdown > this.limits.maxDrawdown) {
      violations.push(`drawdown-limit-hit`);
    }

    const openPositions = this.positionManager.getOpenPositions();
    const totalLeverage = openPositions.reduce((s, p) => s + p.leverage, 0);
    const avgLeverage = openPositions.length > 0 ? totalLeverage / openPositions.length : 0;
    details.avgLeverage = avgLeverage;
    if (avgLeverage > this.limits.maxLeverage) {
      violations.push(`avg-leverage-exceeded`);
    }

    return { passed: violations.length === 0, violations, details };
  }

  recordPnL(pnl: number): void {
    this.resetDailyIfNeeded();
    this.dailyLoss += pnl < 0 ? Math.abs(pnl) : 0;
    this.metrics.increment('riskmanager.pnl.recorded', 1);
  }

  private resetDailyIfNeeded(): void {
    const now = Date.now();
    if (now - this.dailyResetTime > 86400000) {
      this.dailyLoss = 0;
      this.dailyResetTime = now;
    }
  }

  private getDailyReset(): { dailyLoss: number; drawdown: number } {
    this.resetDailyIfNeeded();
    const positions = this.positionManager.getOpenPositions();
    const unrealizedLosers = positions.filter(p => p.unrealizedPnL < 0);
    const maxLoss = unrealizedLosers.reduce((s, p) => s + Math.abs(p.unrealizedPnL), 0);
    return { dailyLoss: this.dailyLoss, drawdown: maxLoss / 100000 };
  }

  getLimits(): RiskLimit { return { ...this.limits }; }
  setLimits(limits: Partial<RiskLimit>): void { this.limits = { ...this.limits, ...limits }; }
}