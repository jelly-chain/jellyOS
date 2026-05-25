import { Logger } from './Logger';

export interface MetricValue {
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

export interface HistogramBucket {
  upperBound: number;
  count: number;
}

export interface HistogramData {
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

export interface MetricSnapshot {
  counter: Record<string, number>;
  gauge: Record<string, number>;
  histogram: Record<string, HistogramData>;
  summary: Record<string, { count: number; sum: number; avg: number }>;
}

export interface MetricConfig {
  enabled: boolean;
  collectInterval: number;
  maxAge: number;
  enableExport: boolean;
  exportEndpoint?: string;
}

const DEFAULT_CONFIG: MetricConfig = {
  enabled: true,
  collectInterval: 60000,
  maxAge: 3600000,
  enableExport: false,
};

export class Metrics {
  private config: MetricConfig;
  private logger: Logger;
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, HistogramData> = new Map();
  private summaries: Map<string, { count: number; sum: number }> = new Map();
  private values: Map<string, MetricValue[]> = new Map();
  private labelSets: Map<string, Record<string, string>> = new Map();
  private collectTimer: NodeJS.Timeout | null = null;

  constructor(logger: Logger, config?: Partial<MetricConfig>) {
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCollection();
  }

  private startCollection(): void {
    if (!this.config.enabled) return;

    this.collectTimer = setInterval(() => {
      this.collect();
    }, this.config.collectInterval);
  }

  private collect(): void {
    const now = Date.now();
    for (const [key, values] of this.values) {
      const filtered = values.filter(v => now - v.timestamp < this.config.maxAge);
      this.values.set(key, filtered);
    }
  }

  increment(counter: string, value: number = 1, labels?: Record<string, string>): void {
    const key = this.makeKey(counter, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
    this.recordValue(key, value, labels);
  }

  decrement(counter: string, value: number = 1, labels?: Record<string, string>): void {
    this.increment(counter, -value, labels);
  }

  getCounter(name: string, labels?: Record<string, string>): number {
    const key = this.makeKey(name, labels);
    return this.counters.get(key) || 0;
  }

  setGauge(gauge: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(gauge, labels);
    this.gauges.set(key, value);
    this.recordValue(key, value, labels);
  }

  getGauge(name: string, labels?: Record<string, string>): number {
    const key = this.makeKey(name, labels);
    return this.gauges.get(key) || 0;
  }

  observe(histogram: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(histogram, labels);
    const buckets = [0.1, 0.5, 1, 5, 10, 30, 100, 500, 1000, 5000, 10000, Infinity];

    let data = this.histograms.get(key);
    if (!data) {
      data = {
        buckets: buckets.map(b => ({ upperBound: b, count: 0 })),
        sum: 0,
        count: 0,
      };
      this.histograms.set(key, data);
    }

    for (const bucket of data.buckets) {
      if (value <= bucket.upperBound) {
        bucket.count++;
      }
    }

    data.sum += value;
    data.count++;
    this.recordValue(key, value, labels);
  }

  getHistogram(name: string, labels?: Record<string, string>): HistogramData {
    const key = this.makeKey(name, labels);
    return this.histograms.get(key) || { buckets: [], sum: 0, count: 0 };
  }

  record(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    let summary = this.summaries.get(key);
    if (!summary) {
      summary = { count: 0, sum: 0 };
      this.summaries.set(key, summary);
    }
    summary.count++;
    summary.sum += value;
    this.recordValue(key, value, labels);
  }

  getSummary(name: string, labels?: Record<string, string>): { count: number; sum: number; avg: number } {
    const key = this.makeKey(name, labels);
    const summary = this.summaries.get(key);
    if (!summary || summary.count === 0) {
      return { count: 0, sum: 0, avg: 0 };
    }
    return {
      count: summary.count,
      sum: summary.sum,
      avg: summary.sum / summary.count,
    };
  }

  private makeKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  private recordValue(key: string, value: number, labels?: Record<string, string>): void {
    if (!this.values.has(key)) {
      this.values.set(key, []);
    }
    const values = this.values.get(key)!;
    values.push({ value, timestamp: Date.now(), labels });
  }

  getSnapshot(): MetricSnapshot {
    const snapshot: MetricSnapshot = {
      counter: Object.fromEntries(this.counters),
      gauge: Object.fromEntries(this.gauges),
      histogram: {},
      summary: {},
    };

    for (const [key, data] of this.histograms) {
      snapshot.histogram[key] = data;
    }

    for (const [key, summary] of this.summaries) {
      snapshot.summary[key] = {
        count: summary.count,
        sum: summary.sum,
        avg: summary.count > 0 ? summary.sum / summary.count : 0,
      };
    }

    return snapshot;
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.summaries.clear();
    this.values.clear();
  }

  getValues(metricName: string): MetricValue[] {
    return this.values.get(metricName) || [];
  }

  getRecentValues(metricName: string, seconds: number): MetricValue[] {
    const cutoff = Date.now() - seconds * 1000;
    return this.getValues(metricName).filter(v => v.timestamp >= cutoff);
  }

  close(): void {
    if (this.collectTimer) {
      clearInterval(this.collectTimer);
      this.collectTimer = null;
    }
  }
}