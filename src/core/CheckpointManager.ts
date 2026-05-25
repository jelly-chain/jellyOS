import { Logger } from './utils/Logger';
import { homedir } from 'os';
import { resolve } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs';

export interface Checkpoint {
  id: string;
  timestamp: number;
  version: string;
  state: any;
  metadata: CheckpointMetadata;
  hash: string;
}

export interface CheckpointMetadata {
  agentId: string;
  taskType: string;
  executionId?: string;
  parentId?: string;
  tags: string[];
  description?: string;
}

export interface CheckpointConfig {
  enabled: boolean;
  autoCreate: boolean;
  autoRestore: boolean;
  maxCheckpoints: number;
  compression: boolean;
  encryption: boolean;
}

const DEFAULT_CONFIG: CheckpointConfig = {
  enabled: true,
  autoCreate: true,
  autoRestore: true,
  maxCheckpoints: 100,
  compression: true,
  encryption: false,
};

export class CheckpointManager {
  private config: CheckpointConfig;
  private logger: Logger;
  private storagePath: string;
  private checkpoints: Map<string, Checkpoint> = new Map();
  private checkpointList: string[] = [];

  constructor(storagePath: string = resolve(homedir(), '.jellyos', 'checkpoints'), config?: Partial<CheckpointConfig>) {
    this.storagePath = storagePath;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = new Logger('CheckpointManager');
    this.ensureStoragePath();
    this.loadExistingCheckpoints();
    if (this.config.autoCreate) {
      // Maybe initialize something
    }
  }

  private ensureStoragePath(): void {
    if (!existsSync(this.storagePath)) {
      mkdirSync(this.storagePath, { recursive: true });
      this.logger.info(`Created checkpoint storage directory: ${this.storagePath}`);
    }
  }

  private loadExistingCheckpoints(): void {
    try {
      const files = this.getCheckpointFiles();
      for (const file of files) {
        const id = this.extractIdFromFilename(file);
        if (id) {
          this.checkpointList.push(id);
        }
      }
      this.logger.info(`Loaded ${this.checkpointList.length} existing checkpoints`);
    } catch (error) {
      this.logger.warn('Failed to load existing checkpoints', error);
    }
  }

  private getCheckpointFiles(): string[] {
    const files: string[] = [];
    try {
      const entries = readdirSync(this.storagePath);
      for (const entry of entries) {
        if (entry.startsWith('checkpoint-') && entry.endsWith('.json')) {
          files.push(entry);
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
    return files;
  }

  private extractIdFromFilename(filename: string): string | null {
    const match = filename.match(/^checkpoint-(.+)\.json$/);
    return match ? match[1] : null;
  }

  createCheckpoint(
    id: string,
    state: any,
    metadata: CheckpointMetadata,
  ): Checkpoint {
    if (!this.config.enabled) {
      return null as any;
    }

    const checkpoint: Checkpoint = {
      id,
      timestamp: Date.now(),
      version: '1.0.0',
      state,
      metadata,
      hash: this.calculateHash(state),
    };

    try {
      this.saveCheckpointToFile(checkpoint);
      this.checkpoints.set(id, checkpoint);
      if (!this.checkpointList.includes(id)) {
        this.checkpointList.push(id);
      }
      this.cleanupOldCheckpoints();
      this.logger.info(`Created checkpoint: ${id}`);
      return checkpoint;
    } catch (error) {
      this.logger.error(`Failed to create checkpoint ${id}`, error);
      throw error;
    }
  }

  restoreCheckpoint(id: string): Checkpoint | null {
    try {
      const checkpoint = this.checkpoints.get(id);
      if (!checkpoint) {
        const checkpointPath = resolve(this.storagePath, `checkpoint-${id}.json`);
        if (existsSync(checkpointPath)) {
          const data = readFileSync(checkpointPath, 'utf-8');
          const loaded = JSON.parse(data);
          this.checkpoints.set(id, loaded);
          return loaded;
        }
        return null;
      }

      this.logger.info(`Restored checkpoint: ${id}`);
      return checkpoint;
    } catch (error) {
      this.logger.error(`Failed to restore checkpoint ${id}`, error);
      return null;
    }
  }

  getCheckpoint(id: string): Checkpoint | null {
    return this.checkpoints.get(id) || this.restoreCheckpoint(id);
  }

  deleteCheckpoint(id: string): boolean {
    try {
      const path = resolve(this.storagePath, `checkpoint-${id}.json`);
      if (existsSync(path)) {
        unlinkSync(path);
      }
      this.checkpoints.delete(id);
      this.checkpointList = this.checkpointList.filter(i => i !== id);
      this.logger.info(`Deleted checkpoint: ${id}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete checkpoint ${id}`, error);
      return false;
    }
  }

  listCheckpoints(): string[] {
    return [...this.checkpointList];
  }

  getLatestCheckpoint(agentId?: string): Checkpoint | null {
    let candidates = [...this.checkpointList];
    if (agentId) {
      candidates = candidates.filter(id => {
        const cp = this.checkpoints.get(id);
        return cp && cp.metadata.agentId === agentId;
      });
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      const aCp = this.checkpoints.get(a);
      const bCp = this.checkpoints.get(b);
      return (bCp?.timestamp || 0) - (aCp?.timestamp || 0);
    });

    return this.checkpoints.get(candidates[0]) || null;
  }

  private saveCheckpointToFile(checkpoint: Checkpoint): void {
    const path = resolve(this.storagePath, `checkpoint-${checkpoint.id}.json`);
    writeFileSync(path, JSON.stringify(checkpoint, null, 2), 'utf-8');
  }

  private calculateHash(data: any): string {
    const json = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < json.length; i++) {
      const char = json.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  private cleanupOldCheckpoints(): void {
    if (this.checkpointList.length <= this.config.maxCheckpoints) return;

    this.checkpointList.sort((a, b) => {
      const aCp = this.checkpoints.get(a);
      const bCp = this.checkpoints.get(b);
      return (aCp?.timestamp || 0) - (bCp?.timestamp || 0);
    });

    const toRemove = this.checkpointList.length - this.config.maxCheckpoints;
    for (let i = 0; i < toRemove; i++) {
      this.deleteCheckpoint(this.checkpointList[i]);
    }
  }

  getConfig(): CheckpointConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<CheckpointConfig>): void {
    this.config = { ...this.config, ...config };
  }

  close(): void {
    this.checkpoints.clear();
    this.checkpointList = [];
    this.logger.info('CheckpointManager closed');
  }
}

export const checkpoints = new CheckpointManager();