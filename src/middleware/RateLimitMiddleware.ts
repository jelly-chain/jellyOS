import { Logger } from '../core/utils/Logger';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  maxConcurrent: number;
  burstLimit: number;
}

export class RateLimitMiddleware {
  private logger: Logger;
  private config: RateLimitConfig;
  private requests: Map<string, number[]> = new Map();
  private concurrent: Map<string, number> = new Map();

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      windowMs: 60000, maxRequests: 100, maxConcurrent: 10, burstLimit: 200,
      ...config,
    };
    this.logger = new Logger('RateLimitMiddleware');
    this.startCleanup();
  }

  private startCleanup(): void {
    setInterval(() => this.cleanup(), this.config.windowMs);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.requests) {
      const valid = timestamps.filter(t => now - t < this.config.windowMs);
      if (valid.length === 0) this.requests.delete(key);
      else this.requests.set(key, valid);
    }
  }

  check(key: string): { allowed: boolean; retryAfter: number; current: number } {
    const now = Date.now();
    if (!this.requests.has(key)) this.requests.set(key, []);
    const timestamps = this.requests.get(key)!;
    const recent = timestamps.filter(t => now - t < this.config.windowMs);
    this.requests.set(key, recent);

    const isAllowed = recent.length < this.config.maxRequests;
    const retryAfter = isAllowed ? 0 : this.config.windowMs - (now - recent[0]);
    return { allowed: isAllowed, retryAfter, current: recent.length };
  }

  acquire(key: string): boolean {
    const check = this.check(key);
    if (!check.allowed) return false;
    this.requests.get(key)!.push(Date.now());
    return true;
  }

  incrementConcurrent(key: string): boolean {
    const current = this.concurrent.get(key) || 0;
    if (current >= this.config.maxConcurrent) return false;
    this.concurrent.set(key, current + 1);
    return true;
  }

  decrementConcurrent(key: string): void {
    const current = this.concurrent.get(key) || 0;
    if (current <= 0) this.concurrent.delete(key);
    else this.concurrent.set(key, current - 1);
  }
}