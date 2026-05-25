import { Logger } from '../core/utils/Logger';
import { Metrics } from '../core/utils/Metrics';

export interface LiquidityAnalysis {
  symbol: string;
  spread: number;
  depth: number;
  slippage: number;
  volume24h: number;
  liquidityScore: number;
  orderBookImbalance: number;
  timestamp: number;
}

export interface SlippageEstimate {
  symbol: string;
  tradeSize: number;
  estimatedSlippage: number;
  priceImpact: number;
  expectedFillPrice: number;
  confidence: number;
}

export class LiquidityModel {
  private logger: Logger;
  private metrics: Metrics;
  private liquidityCache: Map<string, LiquidityAnalysis> = new Map();

  constructor(metrics: Metrics) {
    this.logger = new Logger('LiquidityModel');
    this.metrics = metrics;
  }

  async analyzeLiquidity(
    symbol: string,
    orderBook: { bids: [number, number][]; asks: [number, number][] },
    volume24h: number,
  ): Promise<LiquidityAnalysis> {
    this.logger.info(`Analyzing liquidity for ${symbol}`);

    const spread = this.calculateSpread(orderBook);
    const depth = this.calculateDepth(orderBook);
    const slippage = this.estimateSlippageFromBook(orderBook, 10000);
    const orderBookImbalance = this.calculateImbalance(orderBook);

    const liquidityScore = this.computeLiquidityScore(spread, depth, volume24h, slippage);

    const analysis: LiquidityAnalysis = {
      symbol, spread, depth, slippage, volume24h, liquidityScore, orderBookImbalance,
      timestamp: Date.now(),
    };

    this.liquidityCache.set(symbol, analysis);
    this.metrics.record('liquidity.score', liquidityScore, { symbol });
    return analysis;
  }

  private calculateSpread(orderBook: { bids: [number, number][]; asks: [number, number][] }): number {
    if (orderBook.asks.length === 0 || orderBook.bids.length === 0) return Infinity;
    const bestBid = orderBook.bids[0][0];
    const bestAsk = orderBook.asks[0][0];
    return bestBid > 0 ? (bestAsk - bestBid) / bestBid : Infinity;
  }

  private calculateDepth(orderBook: { bids: [number, number][]; asks: [number, number][] }): number {
    let bidDepth = 0, askDepth = 0;

    for (let i = 0; i < Math.min(10, orderBook.bids.length); i++) {
      bidDepth += orderBook.bids[i][0] * orderBook.bids[i][1];
    }
    for (let i = 0; i < Math.min(10, orderBook.asks.length); i++) {
      askDepth += orderBook.asks[i][0] * orderBook.asks[i][1];
    }

    return (bidDepth + askDepth) / 2;
  }

  private estimateSlippageFromBook(
    orderBook: { bids: [number, number][]; asks: [number, number][] },
    tradeSize: number,
  ): number {
    let remaining = tradeSize;
    let totalCost = 0;
    let filled = 0;

    const levels = orderBook.asks;
    for (const [price, size] of levels) {
      const fill = Math.min(remaining, size * price);
      totalCost += price * (fill / price);
      remaining -= fill / price;
      filled += fill / price;
      if (remaining <= 0) break;
    }

    if (filled === 0) return Infinity;
    const avgPrice = totalCost / filled;
    const midPrice = orderBook.bids.length > 0 && orderBook.asks.length > 0
      ? (orderBook.bids[0][0] + orderBook.asks[0][0]) / 2 : avgPrice;

    return midPrice > 0 ? (avgPrice - midPrice) / midPrice : 0;
  }

  private calculateImbalance(orderBook: { bids: [number, number][]; asks: [number, number][] }): number {
    let bidVolume = 0, askVolume = 0;

    for (const [, size] of orderBook.bids) bidVolume += size;
    for (const [, size] of orderBook.asks) askVolume += size;

    const total = bidVolume + askVolume;
    return total > 0 ? (bidVolume - askVolume) / total : 0;
  }

  private computeLiquidityScore(spread: number, depth: number, volume24h: number, slippage: number): number {
    let score = 0.5;
    if (spread < 0.001) score += 0.2;
    else if (spread < 0.005) score += 0.1;
    else if (spread > 0.01) score -= 0.2;

    if (depth > 1000000) score += 0.15;
    else if (depth > 100000) score += 0.1;
    else if (depth < 10000) score -= 0.15;

    if (volume24h > 10000000) score += 0.15;
    else if (volume24h > 1000000) score += 0.1;
    else if (volume24h < 100000) score -= 0.15;

    if (slippage < 0.001) score += 0.1;
    else if (slippage > 0.01) score -= 0.1;

    return Math.max(0, Math.min(1, score));
  }

  async estimateSlippage(symbol: string, tradeSize: number, currentPrice: number): Promise<SlippageEstimate> {
    const midPrice = currentPrice;
    const baseImpact = tradeSize * midPrice / 1000000;
    const priceImpact = Math.min(baseImpact * 0.1, 0.05);
    const estimatedSlippage = priceImpact + 0.0005;
    const confidence = tradeSize < 100000 ? 0.9 : tradeSize < 1000000 ? 0.7 : 0.5;

    return {
      symbol, tradeSize, estimatedSlippage, priceImpact,
      expectedFillPrice: tradeSize > 0 ? midPrice * (1 + priceImpact) * (1 + 0.0005) : midPrice,
      confidence,
    };
  }

  async getLiquidity(symbol: string): Promise<LiquidityAnalysis | null> {
    return this.liquidityCache.get(symbol) || null;
  }

  clearCache(): void {
    this.liquidityCache.clear();
  }
}