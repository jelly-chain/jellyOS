import { Logger } from '../core/utils/Logger';
import { homedir } from 'os';
import { resolve } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';

export interface MarketSnapshot {
  symbol: string;
  price: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  close: number;
  timestamp: number;
  source: string;
}

export interface MarketPattern {
  id: string;
  symbol: string;
  type: string;
  confidence: number;
  frequency: number;
  lastObserved: number;
  avgReturn: number;
  winRate: number;
}

export class MarketMemory {
  private logger: Logger;
  private snapshots: Map<string, MarketSnapshot[]> = new Map();
  private patterns: Map<string, MarketPattern[]> = new Map();
  private correlationMatrix: Map<string, Map<string, number>> = new Map();
  private persistencePath: string;
  private maxSnapshots: number;

  constructor(persistencePath: string = resolve(homedir(), '.jellyos', 'memory', 'market'), maxSnapshots: number = 10000) {
    this.persistencePath = persistencePath;
    this.maxSnapshots = maxSnapshots;
    this.logger = new Logger('MarketMemory');
    this.ensurePersistencePath();
    this.loadFromDisk();
  }

  private ensurePersistencePath(): void {
    if (!existsSync(this.persistencePath)) {
      mkdirSync(this.persistencePath, { recursive: true });
    }
  }

  private loadFromDisk(): void {
    const symbols = ['BTC', 'ETH', 'SOL', 'BNB'];
    for (const symbol of symbols) {
      const path = resolve(this.persistencePath, `${symbol}.json`);
      if (existsSync(path)) {
        try {
          const data = JSON.parse(readFileSync(path, 'utf-8'));
          this.snapshots.set(symbol, data);
        } catch { this.snapshots.set(symbol, []); }
      } else {
        this.snapshots.set(symbol, []);
      }
    }
  }

  private saveToDisk(symbol: string): void {
    const data = this.snapshots.get(symbol);
    if (!data) return;
    const path = resolve(this.persistencePath, `${symbol}.json`);
    writeFileSync(path, JSON.stringify(data.slice(-this.maxSnapshots)), 'utf-8');
  }

  recordSnapshot(snapshot: MarketSnapshot): void {
    const symbol = snapshot.symbol;
    if (!this.snapshots.has(symbol)) {
      this.snapshots.set(symbol, []);
    }
    const snaps = this.snapshots.get(symbol)!;
    snaps.push(snapshot);

    if (snaps.length > this.maxSnapshots) {
      snaps.splice(0, snaps.length - this.maxSnapshots);
    }

    if (snaps.length % 100 === 0) {
      this.saveToDisk(symbol);
    }
  }

  recordSnapshots(snapshots: MarketSnapshot[]): void {
    for (const snap of snapshots) {
      this.recordSnapshot(snap);
    }
  }

  getSnapshots(symbol: string, limit: number = 100): MarketSnapshot[] {
    const snaps = this.snapshots.get(symbol) || [];
    return snaps.slice(-limit);
  }

  getSnapshotsInRange(symbol: string, startTime: number, endTime: number): MarketSnapshot[] {
    const snaps = this.snapshots.get(symbol) || [];
    return snaps.filter(s => s.timestamp >= startTime && s.timestamp <= endTime);
  }

  getLatestSnapshot(symbol: string): MarketSnapshot | null {
    const snaps = this.snapshots.get(symbol) || [];
    return snaps.length > 0 ? snaps[snaps.length - 1] : null;
  }

  getSymbols(): string[] { return [...this.snapshots.keys()]; }

  calculateCorrelation(symbolA: string, symbolB: string): number {
    const snapsA = this.snapshots.get(symbolA) || [];
    const snapsB = this.snapshots.get(symbolB) || [];

    if (snapsA.length < 10 || snapsB.length < 10) return 0;

    const pricesA = snapsA.slice(-100).map(s => s.price);
    const pricesB = snapsB.slice(-100).map(s => s.price);

    const minLen = Math.min(pricesA.length, pricesB.length);
    const returnsA = [], returnsB = [];

    for (let i = 1; i < minLen; i++) {
      returnsA.push(Math.log(pricesA[i] / pricesA[i - 1]));
      returnsB.push(Math.log(pricesB[i] / pricesB[i - 1]));
    }

    const meanA = returnsA.reduce((s, r) => s + r, 0) / returnsA.length;
    const meanB = returnsB.reduce((s, r) => s + r, 0) / returnsB.length;
    let cov = 0, varA = 0, varB = 0;

    for (let i = 0; i < returnsA.length; i++) {
      cov += (returnsA[i] - meanA) * (returnsB[i] - meanB);
      varA += Math.pow(returnsA[i] - meanA, 2);
      varB += Math.pow(returnsB[i] - meanB, 2);
    }

    return varA > 0 && varB > 0 ? cov / (Math.sqrt(varA) * Math.sqrt(varB)) : 0;
  }

  learnPattern(symbol: string, pattern: Omit<MarketPattern, 'id'>): MarketPattern {
    const fullPattern: MarketPattern = { id: `pat:${symbol}:${Date.now()}`, ...pattern };
    if (!this.patterns.has(symbol)) this.patterns.set(symbol, []);
    const patterns = this.patterns.get(symbol)!;
    const existing = patterns.find(p => p.type === pattern.type);
    if (existing) {
      existing.frequency++;
      existing.lastObserved = Date.now();
      existing.avgReturn = (existing.avgReturn * (existing.frequency - 1) + pattern.avgReturn) / existing.frequency;
      existing.winRate = (existing.winRate * (existing.frequency - 1) + pattern.winRate) / existing.frequency;
      return existing;
    }
    patterns.push(fullPattern);
    return fullPattern;
  }

  getPatterns(symbol: string): MarketPattern[] {
    return this.patterns.get(symbol) || [];
  }

  getHighConfidencePatterns(symbol: string, minConfidence: number = 0.7): MarketPattern[] {
    return (this.patterns.get(symbol) || []).filter(p => p.confidence >= minConfidence);
  }

  getStats(): any {
    const totalSnapshots = [...this.snapshots.values()].reduce((s, arr) => s + arr.length, 0);
    const totalPatterns = [...this.patterns.values()].reduce((s, arr) => s + arr.length, 0);
    return { totalSymbols: this.snapshots.size, totalSnapshots, totalPatterns, maxSnapshots: this.maxSnapshots };
  }

  persist(): void {
    for (const symbol of this.snapshots.keys()) {
      this.saveToDisk(symbol);
    }
  }

  close(): void {
    this.persist();
  }
}

export const marketMemory = new MarketMemory();