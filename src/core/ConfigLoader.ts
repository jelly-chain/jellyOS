import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { homedir } from 'os';
import { Logger, LogLevel } from './utils/Logger';

export interface JellyOSConfig {
  system: SystemConfig;
  agents: AgentConfig;
  blockchain: BlockchainConfig;
  prediction: PredictionConfig;
  trading: TradingConfig;
  context: ContextConfig;
  logging: LoggingConfig;
  features: FeatureFlags;
}

export interface SystemConfig {
  mode: 'production' | 'development' | 'test';
  apiPort: number;
  maxConcurrency: number;
  timeout: number;
  retryAttempts: number;
  backoffDelay: number;
}

export interface AgentConfig {
  maxAgents: number;
  heartbeatInterval: number;
  taskTimeout: number;
  memoryLimit: number;
  defaultAgent: string;
}

export interface BlockchainConfig {
  chains: string[];
  alchemyKey?: string;
  rpcEndpoints: Record<string, string>;
  confirmations: number;
  gasMultiplier: number;
}

export interface PredictionConfig {
  models: string[];
  updateInterval: number;
  confidenceThreshold: number;
  historyWindow: number;
}

export interface TradingConfig {
  enabled: boolean;
  maxSlippage: number;
  positionSize: number;
  stopLoss: number;
  takeProfit: number;
  maxPositions: number;
}

export interface ContextConfig {
  ttl: number;
  maxSize: number;
  redisUrl?: string;
  persistencePath: string;
}

export interface LoggingConfig {
  level: LogLevel;
  fileOutput: boolean;
  consoleOutput: boolean;
  logDirectory: string;
}

export interface FeatureFlags {
  prediction: boolean;
  trading: boolean;
  alerts: boolean;
  learning: boolean;
  cache: boolean;
}

const DEFAULT_CONFIG: JellyOSConfig = {
  system: {
    mode: 'development',
    apiPort: 3000,
    maxConcurrency: 10,
    timeout: 30000,
    retryAttempts: 3,
    backoffDelay: 1000,
  },
  agents: {
    maxAgents: 20,
    heartbeatInterval: 5000,
    taskTimeout: 30000,
    memoryLimit: 512,
    defaultAgent: 'main',
  },
  blockchain: {
    chains: ['ethereum', 'bsc', 'solana', 'arbitrum', 'base'],
    rpcEndpoints: {
      ethereum: 'https://eth-mainnet.alchemyapi.io/v2/',
      bsc: 'https://bsc-dataseed.binance.org/',
      solana: 'https://api.mainnet-beta.solana.com',
      arbitrum: 'https://arb1.arbitrum.io/rpc',
      base: 'https://mainnet.base.org',
    },
    confirmations: 12,
    gasMultiplier: 1.2,
  },
  prediction: {
    models: ['lstm', 'arima', 'garch'],
    updateInterval: 60000,
    confidenceThreshold: 0.7,
    historyWindow: 86400000,
  },
  trading: {
    enabled: false,
    maxSlippage: 0.01,
    positionSize: 0.05,
    stopLoss: 0.1,
    takeProfit: 0.2,
    maxPositions: 10,
  },
  context: {
    ttl: 3600,
    maxSize: 10000,
    persistencePath: './data/context',
  },
  logging: {
    level: LogLevel.INFO,
    fileOutput: true,
    consoleOutput: true,
    logDirectory: './logs',
  },
  features: {
    prediction: true,
    trading: true,
    alerts: true,
    learning: true,
    cache: true,
  },
};

export class ConfigLoader {
  private config: JellyOSConfig;
  private logger: Logger;
  private configPath: string;
  private basePath: string;
  private watchers: Map<string, (value: any) => void> = new Map();

  constructor(configPath: string = './config/config.json', basePath?: string) {
    this.basePath = basePath || resolve(homedir(), '.jellyos');
    this.configPath = resolve(this.basePath, configPath);
    this.logger = new Logger('ConfigLoader');
    this.config = this.loadConfig();
  }

  // Factory method to create loader with custom base path
  static withBasePath(basePath: string, configPath: string = './config/config.json'): ConfigLoader {
    return new ConfigLoader(configPath, basePath);
  }

  private loadConfig(): JellyOSConfig {
    try {
      const env = process.env.NODE_ENV || 'development';
      const envConfigPath = this.configPath.replace('.json', `.${env}.json`);

      let loadedConfig: Partial<JellyOSConfig> = {};

      if (existsSync(envConfigPath)) {
        loadedConfig = JSON.parse(readFileSync(envConfigPath, 'utf-8'));
        this.logger.info(`Loaded environment config from ${envConfigPath}`);
      } else if (existsSync(this.configPath)) {
        loadedConfig = JSON.parse(readFileSync(this.configPath, 'utf-8'));
        this.logger.info(`Loaded config from ${this.configPath}`);
      } else {
        this.logger.warn('No config file found, using defaults');
      }

      this.applyEnvironmentVariables(loadedConfig);

      const merged = this.mergeConfig(DEFAULT_CONFIG, loadedConfig);
      this.logger.info('Configuration loaded successfully');
      return merged;
    } catch (error) {
      this.logger.error('Failed to load config, using defaults', error);
      return DEFAULT_CONFIG;
    }
  }

  private applyEnvironmentVariables(config: Partial<JellyOSConfig>): void {
    const envMappings: Record<string, string[]> = {
      'JELLYOS_SYSTEM_MODE': ['system', 'mode'],
      'JELLYOS_API_PORT': ['system', 'apiPort'],
      'JELLYOS_ALCHEMY_KEY': ['blockchain', 'alchemyKey'],
      'JELLYOS_REDIS_URL': ['context', 'redisUrl'],
      'JELLYOS_LOG_LEVEL': ['logging', 'level'],
    };

    for (const [envKey, path] of Object.entries(envMappings)) {
      const value = process.env[envKey];
      if (value) {
        this.setNestedValue(config, path, this.parseValue(value));
      }
    }
  }

  private parseValue(value: string): any {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(Number(value))) return Number(value);
    return value;
  }

  private mergeConfig(
    defaults: JellyOSConfig,
    override: Partial<JellyOSConfig>,
  ): JellyOSConfig {
    const result = { ...defaults };
    for (const key of Object.keys(override) as (keyof JellyOSConfig)[]) {
      if (override[key] && typeof override[key] === 'object') {
        result[key] = { ...defaults[key], ...override[key] } as any;
      } else {
        result[key] = override[key] as any;
      }
    }
    return result;
  }

  private setNestedValue(obj: any, path: string[], value: any): void {
    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
      if (!current[path[i]]) current[path[i]] = {};
      current = current[path[i]];
    }
    current[path[path.length - 1]] = value;
  }

  getConfig(): JellyOSConfig {
    return this.config;
  }

  get<K extends keyof JellyOSConfig>(key: K): JellyOSConfig[K] {
    return this.config[key];
  }

  getValue<T>(path: string, defaultValue?: T): T {
    const parts = path.split('.');
    let current: any = this.config;
    for (const part of parts) {
      if (current === undefined || current === null) {
        return defaultValue as T;
      }
      current = current[part];
    }
    return (current === undefined ? defaultValue : current) as T;
  }

  set<K extends keyof JellyOSConfig>(key: K, value: JellyOSConfig[K]): void {
    this.config[key] = value;
    this.notifyWatchers(key, value);
  }

  setValue(path: string, value: any): void {
    const parts = path.split('.');
    let current: any = this.config;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
    this.notifyWatchers(path, value);
  }

  watch<K extends keyof JellyOSConfig>(key: K, callback: (value: JellyOSConfig[K]) => void): void {
    this.watchers.set(key, callback);
  }

  unwatch(key: string): void {
    this.watchers.delete(key);
  }

  private notifyWatchers(key: string, value: any): void {
    const callback = this.watchers.get(key);
    if (callback) {
      callback(value);
    }
  }

  save(): void {
    try {
      const dir = dirname(this.configPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
      this.logger.info(`Saved config to ${this.configPath}`);
    } catch (error) {
      this.logger.error('Failed to save config', error);
    }
  }

  reload(): void {
    this.config = this.loadConfig();
    this.logger.info('Configuration reloaded');
  }

  validate(): boolean {
    const errors: string[] = [];
    if (!this.config.system.apiPort || this.config.system.apiPort < 1 || this.config.system.apiPort > 65535) {
      errors.push('Invalid API port');
    }
    if (this.config.trading.positionSize <= 0 || this.config.trading.positionSize > 1) {
      errors.push('Invalid position size');
    }
    if (errors.length > 0) {
      this.logger.error('Config validation failed', errors);
      return false;
    }
    return true;
  }

  // Get the base path used by this loader
  getBasePath(): string {
    return this.basePath;
  }
}

export const config = new ConfigLoader();