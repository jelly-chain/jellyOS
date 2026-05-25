import { Logger } from '../../core/utils/Logger';
import { ContextStore } from '../../context/ContextStore';
import { TaskQueue } from '../../core/TaskQueue';
import { Metrics } from '../../core/utils/Metrics';
import { CheckpointManager } from '../../core/CheckpointManager';

export class TestHelpers {
  static createMockPrices(length: number = 100, basePrice: number = 100, volatility: number = 0.02): number[] {
    const prices: number[] = [];
    let price = basePrice;
    for (let i = 0; i < length; i++) {
      price *= (1 + (Math.random() - 0.5) * volatility * 2);
      prices.push(price);
    }
    return prices;
  }

  static createMockVolume(length: number = 100, baseVolume: number = 1000000): number[] {
    const volume: number[] = [];
    for (let i = 0; i < length; i++) {
      volume.push(baseVolume * (0.5 + Math.random()));
    }
    return volume;
  }

  static createMockOrderBook(): { bids: [number, number][]; asks: [number, number][] } {
    const basePrice = 100;
    const bids: [number, number][] = [];
    const asks: [number, number][] = [];

    for (let i = 0; i < 10; i++) {
      bids.push([basePrice - i * 0.1, 1000 * Math.random()]);
      asks.push([basePrice + i * 0.1, 1000 * Math.random()]);
    }

    return { bids, asks };
  }

  static createTestContext(): ContextStore {
    return new ContextStore({ enablePersistence: false });
  }

  static createTestMetrics(): Metrics {
    return new Metrics(new Logger('Test'), { enabled: false });
  }

  static createTestTaskQueue(): TaskQueue {
    return new TaskQueue({ enablePersistence: false });
  }

  static createTestCheckpointManager(): CheckpointManager {
    return new CheckpointManager('/tmp/jellyos-test-checkpoints');
  }

  static async waitForCondition(
    condition: () => boolean | Promise<boolean>,
    timeout: number = 5000,
    interval: number = 100,
  ): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) return;
      await new Promise(r => setTimeout(r, interval));
    }
    throw new Error('Condition not met within timeout');
  }

  static async measureExecution<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = process.hrtime.bigint();
    const result = await fn();
    const end = process.hrtime.bigint();
    return { result, duration: Number(end - start) / 1e6 };
  }

  static async assertThrows(fn: () => Promise<any>, expectedMessage?: string): Promise<Error> {
    try {
      await fn();
      throw new Error('Expected function to throw');
    } catch (error) {
      if (expectedMessage && !(error as Error).message.includes(expectedMessage)) {
        throw new Error(`Expected error message "${expectedMessage}" but got "${(error as Error).message}"`);
      }
      return error as Error;
    }
  }

  static async retryUntil<T>(fn: () => Promise<T>, predicate: (result: T) => boolean, maxRetries: number = 3): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      const result = await fn();
      if (predicate(result)) return result;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
    throw new Error('Retry limit exceeded');
  }
}