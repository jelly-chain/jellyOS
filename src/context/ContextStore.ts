import { Logger, LogLevel } from '../core/utils/Logger';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

export interface ContextEntry {
  key: string;
  value: any;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  accessCount: number;
  lastAccessed: number;
  ttl?: number;
  relevance: number;
  tags: string[];
}

export interface ContextConfig {
  maxSize: number;
  defaultTTL: number;
  cleanupInterval: number;
  persistencePath: string;
  enablePersistence: boolean;
  relevanceDecay: number;
}

const DEFAULT_CONFIG: ContextConfig = {
  maxSize: 10000,
  defaultTTL: 3600,
  cleanupInterval: 60000,
  persistencePath: resolve(homedir(), '.jellyos', 'cache'),
  enablePersistence: true,
  relevanceDecay: 0.99,
};

export class ContextStore {
  private config: ContextConfig;
  private logger: Logger;
  private store: Map<string, ContextEntry> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private tagIndex: Map<string, Set<string>> = new Map();

  constructor(config?: Partial<ContextConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = new Logger('ContextStore');
    this.ensurePersistencePath();
    this.startCleanup();
  }

  private ensurePersistencePath(): void {
    if (!existsSync(this.config.persistencePath)) {
      mkdirSync(this.config.persistencePath, { recursive: true });
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => this.cleanup(), this.config.cleanupInterval);
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of [...this.store.entries()]) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.delete(key);
        cleaned++;
      }
    }

    if (this.store.size > this.config.maxSize) {
      const entries = [...this.store.entries()]
        .sort((a, b) => a[1].relevance - b[1].relevance);
      const toRemove = entries.slice(0, Math.floor(this.config.maxSize * 0.1));
      for (const [key] of toRemove) {
        this.delete(key);
      }
      cleaned += toRemove.length;
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired entries`);
    }
  }

  set(key: string, value: any, ttl?: number): void {
    const now = Date.now();
    const entry: ContextEntry = {
      key,
      value,
      createdAt: now,
      updatedAt: now,
      lastAccessed: now,
      accessCount: 0,
      relevance: 1.0,
      tags: [],
    };

    if (ttl) {
      entry.ttl = ttl;
      entry.expiresAt = now + ttl * 1000;
    }

    this.store.set(key, entry);

    const words = key.toLowerCase().split(/[:\-_]/);
    for (const word of words) {
      if (!this.tagIndex.has(word)) {
        this.tagIndex.set(word, new Set());
      }
      this.tagIndex.get(word)!.add(key);
    }

    this.emitChangeEvent('set', key, value);
  }

  get(key: string): any {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.delete(key);
      return null;
    }

    entry.accessCount++;
    entry.lastAccessed = Date.now();
    entry.relevance *= this.config.relevanceDecay;
    entry.relevance = Math.min(1.0, entry.relevance + 0.1);

    return entry.value;
  }

  getEntry(key: string): ContextEntry | null {
    return this.store.get(key) || null;
  }

  delete(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;

    this.store.delete(key);

    const words = key.toLowerCase().split(/[:\-_]/);
    for (const word of words) {
      const tagSet = this.tagIndex.get(word);
      if (tagSet) {
        tagSet.delete(key);
      }
    }

    this.emitChangeEvent('delete', key, null);
    return true;
  }

  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;

    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.delete(key);
      return false;
    }

    return true;
  }

  search(query: string, limit: number = 10): ContextEntry[] {
    const terms = query.toLowerCase().split(/\s+/);
    const scores = new Map<string, number>();

    for (const term of terms) {
      for (const [key, entry] of this.store) {
        if (entry.expiresAt && entry.expiresAt < Date.now()) continue;
        let score = 0;
        if (key.toLowerCase().includes(term)) score += 2;
        if (entry.value && JSON.stringify(entry.value).toLowerCase().includes(term)) score += 1;
        scores.set(key, (scores.get(key) || 0) + score + entry.relevance);
      }
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key]) => this.store.get(key)!);
  }

  getByTag(tag: string, limit?: number): ContextEntry[] {
    const keys = this.tagIndex.get(tag.toLowerCase());
    if (!keys) return [];

    const entries = [...keys]
      .map(key => this.store.get(key))
      .filter((entry): entry is ContextEntry => entry !== undefined && (!entry.expiresAt || entry.expiresAt >= Date.now()));

    entries.sort((a, b) => b.relevance - a.relevance);
    return limit ? entries.slice(0, limit) : entries;
  }

  keys(): string[] {
    return [...this.store.keys()];
  }

  clear(): void {
    this.store.clear();
    this.tagIndex.clear();
  }

  size(): number {
    return this.store.size;
  }

  getStats() {
    let totalAccess = 0;
    let expired = 0;
    const now = Date.now();

    for (const entry of this.store.values()) {
      totalAccess += entry.accessCount;
      if (entry.expiresAt && entry.expiresAt < now) expired++;
    }

    return {
      totalEntries: this.store.size,
      totalAccesses: totalAccess,
      expiredEntries: expired,
      tagCount: this.tagIndex.size,
    };
  }

  private emitChangeEvent(action: string, key: string, value: any): void {
    // Event emission for listeners
  }

  close(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.logger.info('ContextStore closed');
  }
}

export const context = new ContextStore();