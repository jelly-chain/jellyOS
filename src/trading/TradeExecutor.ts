import { Logger } from '../core/utils/Logger';
import { Metrics } from '../core/utils/Metrics';
import { ContextStore } from '../context/ContextStore';

export interface TradeOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stopLimit';
  quantity: number;
  price?: number;
  stopPrice?: number;
  slippage: number;
  strategy: string;
  timestamp: number;
  status: TradeStatus;
  fills: Fill[];
}

export interface Fill {
  price: number;
  quantity: number;
  timestamp: number;
  fee: number;
  feeAsset: string;
}

export enum TradeStatus {
  PENDING = 'pending', SUBMITTED = 'submitted', PARTIAL = 'partial',
  FILLED = 'filled', CANCELLED = 'cancelled', REJECTED = 'rejected', EXPIRED = 'expired',
}

export interface ExecutionConfig {
  maxSlippage: number;
  orderTimeout: number;
  retryAttempts: number;
  allowPartial: boolean;
  smartRouting: boolean;
}

export class TradeExecutor {
  private logger: Logger;
  private metrics: Metrics;
  private context: ContextStore;
  private config: ExecutionConfig;
  private orders: Map<string, TradeOrder> = new Map();
  private activeOrders: Set<string> = new Set();

  constructor(context: ContextStore, metrics: Metrics, config?: Partial<ExecutionConfig>) {
    this.context = context;
    this.metrics = metrics;
    this.logger = new Logger('TradeExecutor');
    this.config = {
      maxSlippage: 0.01, orderTimeout: 30000, retryAttempts: 3, allowPartial: true, smartRouting: true,
      ...config,
    };
  }

  async executeOrder(order: TradeOrder): Promise<TradeOrder> {
    this.logger.info(`Executing ${order.side} order for ${order.quantity} ${order.symbol}`);

    order.status = TradeStatus.SUBMITTED;
    order.timestamp = Date.now();
    this.orders.set(order.id, order);
    this.activeOrders.add(order.id);
    this.metrics.increment('trades.executed', 1, { symbol: order.symbol, side: order.side });

    try {
      const executedOrder = await this.routeAndExecute(order);
      this.activeOrders.delete(order.id);
      return executedOrder;
    } catch (error: any) {
      this.activeOrders.delete(order.id);
      return this.handleExecutionError(order, error);
    }
  }

  private async routeAndExecute(order: TradeOrder): Promise<TradeOrder> {
    if (this.config.smartRouting) {
      return await this.smartRouteExecution(order);
    }
    return await this.directExecution(order);
  }

  private async smartRouteExecution(order: TradeOrder): Promise<TradeOrder> {
    const routes = await this.findBestRoutes(order);
    const bestRoute = routes[0];

    if (!bestRoute) return await this.directExecution(order);

    return await this.executeViaRoute(order, bestRoute);
  }

  private async findBestRoutes(order: TradeOrder): Promise<any[]> {
    return [{ exchange: 'jupiter', expectedPrice: order.price || 100, slippage: 0.005, confidence: 0.95 }];
  }

  private async executeViaRoute(order: TradeOrder, route: any): Promise<TradeOrder> {
    order.status = TradeStatus.FILLED;
    const midPrice = route.expectedPrice;
    const executedPrice = order.side === 'buy'
      ? midPrice * (1 + this.config.maxSlippage)
      : midPrice * (1 - this.config.maxSlippage);

    const fill: Fill = {
      price: executedPrice, quantity: order.quantity,
      timestamp: Date.now(), fee: executedPrice * order.quantity * 0.001, feeAsset: 'USDC',
    };
    if (!order.fills) order.fills = [];
    order.fills.push(fill);

    this.metrics.increment('trades.filled', 1, { symbol: order.symbol, route: route.exchange });
    this.logger.info(`Order ${order.id} filled at ${executedPrice}`);
    return order;
  }

  private async directExecution(order: TradeOrder): Promise<TradeOrder> {
    if (order.type === 'market') return await this.executeMarketOrder(order);
    if (order.type === 'limit') return await this.executeLimitOrder(order);
    if (order.type === 'stop') return await this.executeStopOrder(order);
    throw new Error(`Unsupported order type: ${order.type}`);
  }

  private async executeMarketOrder(order: TradeOrder): Promise<TradeOrder> {
    order.status = TradeStatus.FILLED;
    const price = order.price || 100;
    const executedPrice = order.side === 'buy' ? price * (1 + this.config.maxSlippage) : price * (1 - this.config.maxSlippage);

    order.fills = [{
      price: executedPrice, quantity: order.quantity,
      timestamp: Date.now(), fee: executedPrice * order.quantity * 0.001, feeAsset: 'USDC',
    }];

    return order;
  }

  private async executeLimitOrder(order: TradeOrder): Promise<TradeOrder> {
    if (!order.price) throw new Error('Limit order requires a price');

    const marketPrice = 100;
    const shouldFill = order.side === 'buy' ? marketPrice <= order.price : marketPrice >= order.price;

    if (shouldFill) {
      order.status = TradeStatus.FILLED;
      order.fills = [{ price: order.price, quantity: order.quantity, timestamp: Date.now(), fee: 0, feeAsset: 'USDC' }];
    } else {
      order.status = TradeStatus.PENDING;
      this.logger.info(`Limit order ${order.id} not yet fillable`);
    }

    return order;
  }

  private async executeStopOrder(order: TradeOrder): Promise<TradeOrder> {
    if (!order.stopPrice) throw new Error('Stop order requires a stop price');

    const marketPrice = 100;
    const triggered = order.side === 'buy' ? marketPrice >= order.stopPrice : marketPrice <= order.stopPrice;

    if (triggered) {
      this.logger.info(`Stop order ${order.id} triggered at ${order.stopPrice}`);
      return await this.executeMarketOrder({ ...order, type: 'market', price: marketPrice });
    }

    order.status = TradeStatus.PENDING;
    return order;
  }

  private handleExecutionError(order: TradeOrder, error: Error): TradeOrder {
    this.logger.error(`Order ${order.id} execution failed:`, error);
    order.status = TradeStatus.REJECTED;
    this.metrics.increment('trades.rejected', 1, { symbol: order.symbol });

    if (order.status === TradeStatus.REJECTED) {
      this.logger.info(`Order ${order.id} rejected, not retrying`);
    }

    return order;
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order) return false;

    order.status = TradeStatus.CANCELLED;
    this.activeOrders.delete(orderId);
    this.metrics.increment('trades.cancelled', 1);
    this.logger.info(`Cancelled order ${orderId}`);
    return true;
  }

  getOrder(orderId: string): TradeOrder | undefined { return this.orders.get(orderId); }
  getActiveOrders(): TradeOrder[] { return [...this.activeOrders].map(id => this.orders.get(id)!).filter(Boolean); }
  getAllOrders(): TradeOrder[] { return [...this.orders.values()]; }

  getStats() {
    const allOrders = [...this.orders.values()];
    return {
      totalOrders: allOrders.length,
      filled: allOrders.filter(o => o.status === TradeStatus.FILLED).length,
      pending: allOrders.filter(o => o.status === TradeStatus.PENDING).length,
      cancelled: allOrders.filter(o => o.status === TradeStatus.CANCELLED).length,
      rejected: allOrders.filter(o => o.status === TradeStatus.REJECTED).length,
      activeOrders: this.activeOrders.size,
      fillRate: allOrders.length > 0 ? allOrders.filter(o => o.status === TradeStatus.FILLED).length / allOrders.length : 0,
    };
  }

  close(): void {
    this.orders.clear(); this.activeOrders.clear();
    this.logger.info('TradeExecutor closed');
  }
}