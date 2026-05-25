import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { homedir } from 'os';

export interface EnvConfig {
  [key: string]: string | undefined;
  ALCHEMY_KEY?: string;
  INFURA_KEY?: string;
  SOLANA_RPC_URL?: string;
  ETHEREUM_RPC_URL?: string;
  BSC_RPC_URL?: string;
  POLYGON_RPC_URL?: string;
  ARBITRUM_RPC_URL?: string;
  BASE_RPC_URL?: string;
  REDIS_URL?: string;
  DATABASE_URL?: string;
  JWT_SECRET?: string;
  API_KEY?: string;
  PRIVATE_KEY?: string;
  WALLET_PRIVATE_KEY?: string;
  TRADING_ENABLED?: string;
  PREDICTION_ENABLED?: string;
  LOG_LEVEL?: string;
}

const REQUIRED_ENV_VARS = [
  'ALCHEMY_KEY',
];

const DEFAULT_VALUES: Record<string, string> = {
  LOG_LEVEL: 'info',
  TRADING_ENABLED: 'false',
  PREDICTION_ENABLED: 'true',
};

export class EnvLoader {
  private envConfig: EnvConfig = {};
  protected envPath: string;

  constructor(envPath: string = './.env.local') {
    // Resolve relative to ~/.jellyos/
    const basePath = resolve(homedir(), '.jellyos');
    this.envPath = resolve(basePath, envPath);
    this.load();
  }

  // Allow specifying a custom base path for testing or special configurations
  static withBasePath(basePath: string, envPath: string = './.env.local'): EnvLoader {
    const loader = new EnvLoader(envPath);
    // Override the computed path - but we need to adjust the constructor logic
    // Actually simpler: just set this.envPath after super call
    // But we can't easily override in static factory without modifying constructor
    // Let's create a separate method
    return new EnvLoaderWithPath(resolve(basePath, envPath));
  }

  protected load(): void {
    const envFiles = [
      this.envPath,
      resolve(dirname(this.envPath), '.env'),
      resolve(dirname(this.envPath), '.env.example'),
    ];

    for (const envFile of envFiles) {
      if (existsSync(envFile)) {
        this.parseEnvFile(envFile);
      }
    }

    this.loadFromProcessEnv();
    this.validate();
  }

  private parseEnvFile(filePath: string): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');

        if (key) {
          this.envConfig[key.trim()] = value;
        }
      }
    } catch (error) {
      // Silently continue if file can't be read
    }
  }

  private loadFromProcessEnv(): void {
    for (const key of Object.keys(process.env)) {
      const value = process.env[key];
      if (value !== undefined) {
        this.envConfig[key] = value;
      }
    }
  }

  private validate(): void {
    const missing: string[] = [];
    for (const varName of REQUIRED_ENV_VARS) {
      if (!this.envConfig[varName]) {
        missing.push(varName);
      }
    }
    if (missing.length > 0) {
      console.warn(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  get(key: string, defaultValue?: string): string | undefined {
    return this.envConfig[key] ?? process.env[key] ?? defaultValue ?? DEFAULT_VALUES[key];
  }

  getRequired(key: string): string {
    const value = this.get(key);
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  }

  getNumber(key: string, defaultValue: number): number {
    const value = this.get(key);
    if (value === undefined) return defaultValue;
    const parsed = Number(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  getBoolean(key: string, defaultValue: boolean): boolean {
    const value = this.get(key);
    if (value === undefined) return defaultValue;
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    return defaultValue;
  }

  getAll(): EnvConfig {
    return { ...this.envConfig };
  }

  reload(): void {
    this.envConfig = {};
    this.load();
  }
}

// Helper class to allow custom base path
class EnvLoaderWithPath extends EnvLoader {
  constructor(envPath: string) {
    super('');
    this.envPath = envPath;
    this.load();
  }
}

export const env = new EnvLoader();