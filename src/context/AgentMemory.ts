import { Logger } from '../core/utils/Logger';
import { homedir } from 'os';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';

export interface MemoryEntry {
  id: string;
  agentId: string;
  type: MemoryType;
  content: any;
  importance: number;
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
  decay: number;
  ttl?: number;
}

export enum MemoryType {
  OBSERVATION = 'observation',
  ACTION = 'action',
  RESULT = 'result',
  PREDICTION = 'prediction',
  ERROR = 'error',
  PREFERENCE = 'preference',
  SKILL = 'skill',
}

export interface AgentMemoryConfig {
  maxSize: number;
  defaultTTL: number;
  decayRate: number;
  persistencePath: string;
}

const DEFAULT_CONFIG: AgentMemoryConfig = {
  maxSize: 10000,
  defaultTTL: 86400,
  decayRate: 0.99,
  persistencePath: resolve(homedir(), '.jellyos', 'memory', 'agents'),
};

export class AgentMemory {
  private config: AgentMemoryConfig;
  private logger: Logger;
  private memories: Map<string, MemoryEntry> = new Map();
  private agentMemories: Map<string, Set<string>> = new Map();
  private typeIndex: Map<string, Set<string>> = new Map();
  private decayTimer: NodeJS.Timeout | null = null;

  constructor(agentId: string, config?: Partial<AgentMemoryConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = new Logger(`AgentMemory:${agentId}`);
    this.ensurePersistencePath();
    this.startDecayTimer();
  }

  private ensurePersistencePath(): void {
    if (!existsSync(this.config.persistencePath)) {
      mkdirSync(this.config.persistencePath, { recursive: true });
    }
  }

  private startDecayTimer(): void {
    this.decayTimer = setInterval(() => this.decayMemories(), 60000);
  }

  private decayMemories(): void {
    for (const [key, entry] of [...this.memories.entries()]) {
      entry.decay *= this.config.decayRate;
      entry.accessCount = Math.floor(entry.accessCount * this.config.decayRate);

      if (entry.decay < 0.1 && entry.importance < 0.5) {
        this.forget(key);
      }
    }
  }

  remember(
    agentId: string,
    type: MemoryType,
    content: any,
    importance: number = 0.5,
    ttl?: number,
  ): string {
    const id = `${agentId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

    const entry: MemoryEntry = {
      id,
      agentId,
      type,
      content,
      importance,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 1,
      decay: 1.0,
      ttl,
    };

    this.memories.set(id, entry);

    if (!this.agentMemories.has(agentId)) {
      this.agentMemories.set(agentId, new Set());
    }
    this.agentMemories.get(agentId)!.add(id);

    if (!this.typeIndex.has(type)) {
      this.typeIndex.set(type, new Set());
    }
    this.typeIndex.get(type)!.add(id);

    this.logger.debug(`Remembered ${type} for agent ${agentId}`);
    return id;
  }

  recall(id: string): MemoryEntry | null {
    const entry = this.memories.get(id);
    if (!entry) return null;

    if (entry.ttl && Date.now() - entry.createdAt > entry.ttl * 1000) {
      this.forget(id);
      return null;
    }

    entry.lastAccessed = Date.now();
    entry.accessCount++;
    entry.decay = Math.min(1.0, entry.decay + 0.1);

    return entry;
  }

  recallByAgent(agentId: string, limit: number = 100): MemoryEntry[] {
    const ids = this.agentMemories.get(agentId);
    if (!ids) return [];

    return [...ids]
      .map(id => this.memories.get(id))
      .filter(entry => entry && (!entry.ttl || Date.now() - entry.createdAt <= entry.ttl * 1000))
      .sort((a, b) => b!.lastAccessed - a!.lastAccessed)
      .slice(0, limit) as MemoryEntry[];
  }

  recallByType(type: MemoryType, limit: number = 100): MemoryEntry[] {
    const ids = this.typeIndex.get(type);
    if (!ids) return [];

    return [...ids]
      .map(id => this.memories.get(id))
      .filter(entry => entry && (!entry.ttl || Date.now() - entry.createdAt <= entry.ttl * 1000))
      .sort((a, b) => b!.lastAccessed - a!.lastAccessed)
      .slice(0, limit) as MemoryEntry[];
  }

  search(query: any, agentId?: string, limit: number = 50): MemoryEntry[] {
    const results: MemoryEntry[] = [];

    for (const entry of this.memories.values()) {
      if (agentId && entry.agentId !== agentId) continue;
      if (entry.ttl && Date.now() - entry.createdAt > entry.ttl * 1000) continue;

      if (this.matchesQuery(entry.content, query)) {
        results.push(entry);
      }
    }

    return results
      .sort((a, b) => b.importance * b.decay - a.importance * a.decay)
      .slice(0, limit);
  }

  private matchesQuery(content: any, query: any): boolean {
    if (typeof query === 'string') {
      return JSON.stringify(content).toLowerCase().includes(query.toLowerCase());
    }
    if (typeof query === 'object') {
      return JSON.stringify(content).includes(JSON.stringify(query));
    }
    return false;
  }

  forget(id: string): boolean {
    const entry = this.memories.get(id);
    if (!entry) return false;

    this.memories.delete(id);
    this.agentMemories.get(entry.agentId)?.delete(id);
    this.typeIndex.get(entry.type)?.delete(id);

    this.logger.debug(`Forgot memory ${id}`);
    return true;
  }

  forgetByAgent(agentId: string): number {
    const ids = this.agentMemories.get(agentId);
    if (!ids) return 0;

    let count = 0;
    for (const id of [...ids]) {
      if (this.forget(id)) count++;
    }

    this.logger.debug(`Forgot ${count} memories for agent ${agentId}`);
    return count;
  }

  forgetByDecay(threshold: number = 0.2): number {
    let count = 0;

    for (const [id, entry] of [...this.memories.entries()]) {
      if (entry.decay < threshold && entry.importance < 0.5) {
        this.forget(id);
        count++;
      }
    }

    return count;
  }

  consolidate(): number {
    const consolidated = 0;
    // Consolidation logic would go here
    return consolidated;
  }

  getStats() {
    let totalImportance = 0;
    let totalDecay = 0;

    for (const entry of this.memories.values()) {
      totalImportance += entry.importance;
      totalDecay += entry.decay;
    }

    return {
      totalMemories: this.memories.size,
      avgImportance: totalImportance / this.memories.size,
      avgDecay: totalDecay / this.memories.size,
      agentCount: this.agentMemories.size,
      typeCount: this.typeIndex.size,
    };
  }

  close(): void {
    if (this.decayTimer) {
      clearInterval(this.decayTimer);
      this.decayTimer = null;
    }
    this.memories.clear();
    this.agentMemories.clear();
    this.typeIndex.clear();
    this.logger.info('AgentMemory closed');
  }
}

export const createAgentMemory = (agentId: string) => new AgentMemory(agentId);