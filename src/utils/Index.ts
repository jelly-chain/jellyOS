export { CryptoUtils, crypto } from './CryptoUtils';
export { ValidationUtils } from './ValidationUtils';

export class Utils {
  static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static retry<T>(fn: () => Promise<T>, options: { maxAttempts?: number; delay?: number } = {}): Promise<T> {
    const { maxAttempts = 3, delay = 1000 } = options;
    return fn().catch((error) => {
      if (maxAttempts <= 1) throw error;
      return Utils.sleep(delay).then(() => Utils.retry(fn, { maxAttempts: maxAttempts - 1, delay }));
    });
  }

  static debounce(fn: Function, delay: number): (...args: any[]) => void {
    let timer: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  static throttle<T extends (...args: any[]) => any>(fn: T, limit: number): T {
    let throttling = false;
    return ((...args: any[]) => {
      if (!throttling) {
        throttling = true;
        setTimeout(() => { throttling = false; }, limit);
        return fn(...args);
      }
    }) as T;
  }

  static deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  static deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
    const result = { ...target };
    for (const key of Object.keys(source) as (keyof T)[]) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = Utils.deepMerge(result[key] as any, source[key] as any);
      } else if (source[key] !== undefined) {
        result[key] = source[key]!;
      }
    }
    return result;
  }

  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static formatDuration(ms: number): string {
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(' ');
  }

  static formatCurrency(value: number, decimals: number = 2): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  static formatPercent(value: number, decimals: number = 2): string {
    return `${(value * 100).toFixed(decimals)}%`;
  }

  static groupBy<T>(items: T[], key: keyof T): Map<any, T[]> {
    const map = new Map<any, T[]>();
    for (const item of items) {
      const val = item[key];
      if (!map.has(val)) map.set(val, []);
      map.get(val)!.push(item);
    }
    return map;
  }

  static chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  static uniqueBy<T>(arr: T[], key: keyof T): T[] {
    const seen = new Set();
    return arr.filter(item => {
      const val = item[key];
      if (seen.has(val)) return false;
      seen.add(val);
      return true;
    });
  }

  static async batchProcess<T, R>(items: T[], processor: (item: T) => Promise<R>, batchSize: number = 10): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(processor));
      results.push(...batchResults);
    }
    return results;
  }

  static weightedAverage(values: number[], weights: number[]): number {
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    if (totalWeight === 0) return 0;
    return values.reduce((sum, val, i) => sum + val * weights[i], 0) / totalWeight;
  }
}

export default Utils;