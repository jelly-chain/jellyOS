export { Logger, LogLevel } from './Logger';
export { Metrics } from './Metrics';

export type { LogEntry, LoggerConfig } from './Logger';
export type { MetricValue, HistogramBucket, HistogramData, MetricSnapshot, MetricConfig } from './Metrics';

export const createLogger = (context: string) => new Logger(context);
export const createMetrics = (logger: Logger) => new Metrics(logger);

import { Logger } from './Logger';
import { Metrics } from './Metrics';

export class LoggerFactory {
  private static loggerCache: Map<string, Logger> = new Map();
  private static metricsCache: Map<string, Metrics> = new Map();

  static getLogger(context: string, config?: any): Logger {
    if (!this.loggerCache.has(context)) {
      this.loggerCache.set(context, new Logger(context, config));
    }
    return this.loggerCache.get(context)!;
  }

  static getMetrics(context: string): Metrics {
    if (!this.metricsCache.has(context)) {
      const logger = this.getLogger(`Metrics:${context}`);
      this.metricsCache.set(context, new Metrics(logger));
    }
    return this.metricsCache.get(context)!;
  }

  static reset(): void {
    for (const logger of this.loggerCache.values()) {
      logger.close();
    }
    this.loggerCache.clear();
    this.metricsCache.clear();
  }
}

export default { LoggerFactory };