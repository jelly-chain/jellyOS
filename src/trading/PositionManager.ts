import { Logger } from '../core/utils/Logger';
import { Metrics } from '../core/utils/Metrics';

export interface Position {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  entryTime: number;
  updatedTime: number;
  realizedPnL: number;
  unrealizedPnL: number;
  fees: number;
  status: PositionStatus;
  strategy: string;
  tags: string[];
}

export enum PositionStatus {
  OPEN = 'open', CLOSED = 'closed', STOPPED = 'stopped', LIQUIDATED = 'liquidated',
}

export interface PositionConfig {
  defaultStopLoss: number;
  defaultTakeProfit: number;
  maxLeverage: number;
  trailingStop: boolean;
  trailingStopDistance: number;
}

export class PositionManager {
  private logger: Logger;
  private metrics: Metrics;
  private config: PositionConfig;
  private positions: Map<string, Position> = new Map();
  private closedPositions: Position[] = [];
  private trailingStops: Map<string, number> = new Map();

  constructor(metrics: Metrics, config?: Partial<PositionConfig>) {
    this.metrics = metrics;
    this.logger = new Logger('PositionManager');
    this.config = { defaultStopLoss: 0.05, defaultTakeProfit: 0.15, maxLeverage: 5, trailingStop: true, trailingStopDistance: 0.02, ...config };
  }

  openPosition(params: Partial<Position>): Position {
    const id = `pos:${params.symbol}:${Date.now()}`;
    const position: Position = {
      id, symbol: params.symbol!, side: params.side!, entryPrice: params.entryPrice!,
      currentPrice: params.entryPrice!, quantity: params.quantity!, entryTime: Date.now(),
      updatedTime: Date.now(), realizedPnL: 0, unrealizedPnL: 0, fees: 0,
      status: PositionStatus.OPEN, strategy: params.strategy || 'manual', tags: params.tags || [],
      stopLoss: params.stopLoss || params.entryPrice! * (1 - (params.side === 'long' ? this.config.defaultStopLoss : -this.config.defaultStopLoss)),
      takeProfit: params.takeProfit || params.entryPrice! * (1 + (params.side === 'long' ? this.config.defaultTakeProfit : -this.config.defaultTakeProfit)),
      leverage: params.leverage || 1,
    };

    this.positions.set(id, position);
    this.metrics.increment('positions.opened', 1, { symbol: position.symbol, side: position.side });
    this.logger.info(`Opened ${position.side} position ${id}: ${position.quantity} ${position.symbol} @ ${position.entryPrice}`);
    return position;
  }

  closePosition(positionId: string, closePrice?: number): Position | null {
    const position = this.positions.get(positionId);
    if (!position) return null;

    const exitPrice = closePrice || position.currentPrice;
    const grossPnL = position.side === 'long'
      ? (exitPrice - position.entryPrice) * position.quantity
      : (position.entryPrice - exitPrice) * position.quantity;

    position.realizedPnL = grossPnL * position.leverage - position.fees;
    position.currentPrice = exitPrice;
    position.status = PositionStatus.CLOSED;
    position.updatedTime = Date.now();

    this.positions.delete(positionId);
    this.closedPositions.push(position);
    this.metrics.increment('positions.closed', 1, { symbol: position.symbol });
    this.logger.info(`Closed position ${positionId}: PnL ${position.realizedPnL}`);

    return position;
  }

  updatePrice(positionId: string, newPrice: number): Position | null {
    const position = this.positions.get(positionId);
    if (!position) return null;

    const prevPrice = position.currentPrice;
    position.currentPrice = newPrice;
    position.updatedTime = Date.now();
    position.unrealizedPnL = position.side === 'long'
      ? (newPrice - position.entryPrice) * position.quantity * position.leverage
      : (position.entryPrice - newPrice) * position.quantity * position.leverage;

    if (this.config.trailingStop) this.updateTrailingStop(position, newPrice);

    const shouldStop = this.shouldTriggerStop(position);
    if (shouldStop) return this.closePosition(positionId, newPrice);

    return position;
  }

  private updateTrailingStop(position: Position, newPrice: number): void {
    const stopKey = position.id;
    const currentStop = this.trailingStops.get(stopKey) || position.stopLoss;

    if (position.side === 'long' && newPrice > currentStop + this.config.trailingStopDistance) {
      const newStop = newPrice - this.config.trailingStopDistance;
      this.trailingStops.set(stopKey, newStop);
      position.stopLoss = newStop;
    } else if (position.side === 'short' && newPrice < currentStop - this.config.trailingStopDistance) {
      const newStop = newPrice + this.config.trailingStopDistance;
      this.trailingStops.set(stopKey, newStop);
      position.stopLoss = newStop;
    }
  }

  private shouldTriggerStop(position: Position): boolean {
    if (position.side === 'long' && position.currentPrice <= position.stopLoss) return true;
    if (position.side === 'long' && position.currentPrice >= position.takeProfit) return true;
    if (position.side === 'short' && position.currentPrice >= position.stopLoss) return true;
    if (position.side === 'short' && position.currentPrice <= position.takeProfit) return true;
    return false;
  }

  getPosition(positionId: string): Position | undefined { return this.positions.get(positionId); }
  getOpenPositions(): Position[] { return [...this.positions.values()]; }
  getPositionsBySymbol(symbol: string): Position[] {
    return [...this.positions.values()].filter(p => p.symbol === symbol);
  }
  getClosedPositions(limit: number = 50): Position[] { return this.closedPositions.slice(-limit); }

  getStats() {
    const open = this.getOpenPositions();
    const totalUnrealized = open.reduce((s, p) => s + p.unrealizedPnL, 0);
    const totalRealized = this.closedPositions.reduce((s, p) => s + p.realizedPnL, 0);
    const wins = this.closedPositions.filter(p => p.realizedPnL > 0).length;
    const losses = this.closedPositions.filter(p => p.realizedPnL < 0).length;

    return {
      openPositions: open.length, closedPositions: this.closedPositions.length,
      totalUnrealizedPnL: totalUnrealized, totalRealizedPnL: totalRealized,
      winRate: wins + losses > 0 ? wins / (wins + losses) : 0, wins, losses,
      totalFees: this.closedPositions.reduce((s, p) => s + p.fees, 0),
    };
  }

  close(): void {
    this.positions.clear(); this.closedPositions = []; this.trailingStops.clear();
    this.logger.info('PositionManager closed');
  }
}