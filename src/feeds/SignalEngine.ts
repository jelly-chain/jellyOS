import { FeedManager, FeedItem } from './FeedManager';
import { Logger } from '../core/utils/Logger';

export interface TradingSignal {
  id: string;
  asset: string;
  direction: 'long' | 'short' | 'neutral';
  strength: number; // 0–1
  sources: string[];
  rationale: string;
  suggestedEntry?: number;
  suggestedStopLoss?: number;
  suggestedTakeProfit?: number;
  timestamp: number;
  expiresAt: number;
  confidence: number;
}

export class SignalEngine {
  private feeds: FeedManager;
  private logger: Logger;
  private signals: TradingSignal[] = [];
  private maxSignals = 50;

  constructor(feeds: FeedManager) {
    this.feeds = feeds;
    this.logger = new Logger('SignalEngine');

    // Subscribe to feed events and generate signals
    feeds.subscribe((item) => this.processItem(item));
  }

  private processItem(item: FeedItem): void {
    try {
      const signal = this.extractSignal(item);
      if (signal) {
        this.signals.unshift(signal);
        if (this.signals.length > this.maxSignals) {
          this.signals = this.signals.slice(0, this.maxSignals);
        }
      }
    } catch { /* ignore */ }
  }

  private extractSignal(item: FeedItem): TradingSignal | null {
    const now = Date.now();
    const expires = now + 3_600_000; // 1 hour default

    // Fear & Greed extremes
    if (item.source === 'alternative.me') {
      const score = item.metadata?.score as number;
      if (score !== undefined) {
        if (score <= 20) {
          return this.makeSignal('BTC', 'long', 0.7, ['fear_greed'],
            `Extreme Fear (${score}) — historically good entry point`, now, expires, 0.6);
        }
        if (score >= 85) {
          return this.makeSignal('BTC', 'short', 0.6, ['fear_greed'],
            `Extreme Greed (${score}) — potential distribution zone`, now, expires, 0.55);
        }
      }
    }

    // Large price moves
    if (item.category === 'price' && item.metadata?.change24h !== undefined) {
      const change = item.metadata.change24h as number;
      const asset = (item.metadata?.asset as string || 'BTC').toUpperCase();

      if (change <= -15) {
        return this.makeSignal(asset, 'long', 0.6, ['coingecko_prices'],
          `Sharp drop ${change.toFixed(1)}% — potential oversold bounce`, now, expires, 0.5);
      }
      if (change >= 20) {
        return this.makeSignal(asset, 'short', 0.55, ['coingecko_prices'],
          `Sharp pump ${change.toFixed(1)}% — potential local top`, now, expires, 0.45);
      }
    }

    // High funding rates → short signal (longs paying too much)
    if (item.source === 'coinglass' && item.metadata?.rates) {
      const rates = item.metadata.rates as any[];
      const avgRate = rates.reduce((s: number, r: any) => s + (r.fundingRate || 0), 0) / (rates.length || 1);
      if (avgRate > 0.0008) {
        return this.makeSignal('BTC', 'short', 0.65, ['funding_rates'],
          `High funding rate (${(avgRate * 100).toFixed(4)}%) — longs overextended`, now, expires, 0.6);
      }
      if (avgRate < -0.0003) {
        return this.makeSignal('BTC', 'long', 0.6, ['funding_rates'],
          `Negative funding (${(avgRate * 100).toFixed(4)}%) — shorts overextended`, now, expires, 0.55);
      }
    }

    return null;
  }

  private makeSignal(
    asset: string, direction: 'long' | 'short' | 'neutral',
    strength: number, sources: string[], rationale: string,
    timestamp: number, expiresAt: number, confidence: number,
  ): TradingSignal {
    return {
      id: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      asset, direction, strength, sources, rationale,
      timestamp, expiresAt, confidence,
    };
  }

  /**
   * Returns the estimated net PnL across all active signals.
   * Calculated as: sum of (signal.strength * direction_sign * 100) for active longs/shorts.
   * AutoVault uses this to decide when to sweep profits.
   */
  getNetPnL(): number {
    const active = this.getActiveSignals();
    return active.reduce((sum, s) => {
      const sign = s.direction === 'long' ? 1 : s.direction === 'short' ? -1 : 0;
      return sum + sign * s.strength * 100;
    }, 0);
  }

  getActiveSignals(asset?: string): TradingSignal[] {
    const now = Date.now();
    const active = this.signals.filter(s => s.expiresAt > now);
    if (asset) return active.filter(s => s.asset.toUpperCase() === asset.toUpperCase());
    return active;
  }

  getSummary(): string {
    const active = this.getActiveSignals();
    if (active.length === 0) return 'No active signals.';
    return active.map(s =>
      `[${s.asset}] ${s.direction.toUpperCase()} — strength: ${(s.strength * 100).toFixed(0)}% — ${s.rationale}`
    ).join('\n');
  }

  getStats(): any {
    const active = this.getActiveSignals();
    return {
      totalSignals: this.signals.length,
      activeSignals: active.length,
      longSignals: active.filter(s => s.direction === 'long').length,
      shortSignals: active.filter(s => s.direction === 'short').length,
      avgStrength: active.length > 0 ?
        (active.reduce((s, sig) => s + sig.strength, 0) / active.length).toFixed(2) : '0',
    };
  }
}
