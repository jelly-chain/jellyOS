import { Logger } from '../core/utils/Logger';
import { ContextStore } from '../context/ContextStore';
import { Metrics } from '../core/utils/Metrics';

export interface PredictionInput {
  symbol: string;
  prices: number[];
  volume: number[];
  indicators: Record<string, any>;
  timeframe: string;
}

export interface PredictionOutput {
  symbol: string;
  direction: 'up' | 'down' | 'sideways';
  probability: number;
  targetPrice: number;
  confidence: number;
  timeframe: string;
  factors: Array<{ name: string; impact: number; direction: string }>;
  timestamp: number;
}

export interface ModelConfig {
  horizon: number;
  confidenceThreshold: number;
  useEnsemble: boolean;
  weights: Record<string, number>;
}

export class PredictionModel {
  private logger: Logger;
  private context: ContextStore;
  private metrics: Metrics;
  private config: ModelConfig;
  private predictionCache: Map<string, PredictionOutput> = new Map();
  private modelPerformance: Map<string, number[]> = new Map();
  private ensembleWeights: Map<string, number> = new Map();

  constructor(
    context: ContextStore,
    metrics: Metrics,
    config?: Partial<ModelConfig>,
  ) {
    this.context = context;
    this.metrics = metrics;
    this.logger = new Logger('PredictionModel');
    this.config = {
      horizon: 24,
      confidenceThreshold: 0.7,
      useEnsemble: true,
      weights: { trend: 0.3, momentum: 0.2, volatility: 0.15, volume: 0.15, sentiment: 0.2 },
      ...config,
    };
    this.initializeWeights();
  }

  private initializeWeights(): void {
    this.ensembleWeights.set('lstm', 0.4);
    this.ensembleWeights.set('arima', 0.3);
    this.ensembleWeights.set('garch', 0.3);
  }

  async predict(input: PredictionInput): Promise<PredictionOutput> {
    this.logger.info(`Generating prediction for ${input.symbol}`);

    const cacheKey = `prediction:${input.symbol}:${input.timeframe}`;
    const cached = this.predictionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.config.horizon * 3600000) {
      return cached;
    }

    const prices = input.prices;
    if (!prices || prices.length < 20) {
      return this.createDefaultPrediction(input);
    }

    const trendPrediction = await this.predictTrend(prices);
    const momentumScore = await this.calculateMomentum(prices);
    const volatilityImpact = await this.calculateVolatilityImpact(prices);
    const volumeAnalysis = await this.analyzeVolume(input.volume, prices);
    const sentimentScore = await this.analyzeSentiment(input.symbol);

    const direction = this.determineDirection(trendPrediction, momentumScore, sentimentScore);
    const probability = this.calculateProbability(trendPrediction, momentumScore, volatilityImpact, volumeAnalysis, sentimentScore);
    const targetPrice = this.calculateTargetPrice(prices, direction, probability);
    const confidence = this.calculateConfidence(probability, volatilityImpact);

    const factors = [
      { name: 'trend', impact: trendPrediction, direction: trendPrediction > 0 ? 'bullish' : trendPrediction < 0 ? 'bearish' : 'neutral' },
      { name: 'momentum', impact: momentumScore, direction: momentumScore > 0 ? 'bullish' : 'bearish' },
      { name: 'volatility', impact: volatilityImpact, direction: volatilityImpact > 0.3 ? 'high' : 'low' },
      { name: 'volume', impact: volumeAnalysis, direction: volumeAnalysis > 0 ? 'increasing' : 'decreasing' },
      { name: 'sentiment', impact: sentimentScore, direction: sentimentScore > 0 ? 'positive' : 'negative' },
    ];

    const output: PredictionOutput = {
      symbol: input.symbol,
      direction,
      probability,
      targetPrice,
      confidence,
      timeframe: input.timeframe,
      factors: factors.filter(f => Math.abs(f.impact) > 0.01),
      timestamp: Date.now(),
    };

    this.predictionCache.set(cacheKey, output);
    this.metrics.increment('predictions.made', 1, { symbol: input.symbol });
    this.logger.info(`Prediction for ${input.symbol}: ${direction} (${(probability * 100).toFixed(0)}% confidence)`);

    return output;
  }

  private createDefaultPrediction(input: PredictionInput): PredictionOutput {
    const prices = input.prices || [];
    return {
      symbol: input.symbol,
      direction: 'sideways',
      probability: 0.5,
      targetPrice: prices.length > 0 ? prices[prices.length - 1] : 0,
      confidence: 0.3,
      timeframe: input.timeframe,
      factors: [{ name: 'insufficient-data', impact: 1, direction: 'neutral' }],
      timestamp: Date.now(),
    };
  }

  private async predictTrend(prices: number[]): Promise<number> {
    if (prices.length < 20) return 0;

    const shortSMA = this.calculateSMA(prices.slice(-10), 10);
    const longSMA = this.calculateSMA(prices.slice(-20), 20);
    const priceChange = (prices[prices.length - 1] - prices[0]) / prices[0];

    return (shortSMA - longSMA) / longSMA * 10 + priceChange * 2;
  }

  private async calculateMomentum(prices: number[]): Promise<number> {
    if (prices.length < 14) return 0;

    const period = 14;
    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i <= period && i < prices.length; i++) {
      const change = prices[prices.length - i] - prices[prices.length - i - 1];
      if (change > 0) gains.push(change);
      else losses.push(-change);
    }

    const avgGain = gains.reduce((s, v) => s + v, 0) / period;
    const avgLoss = losses.reduce((s, v) => s + v, 0) / period;
    const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    const rsiSignal = (rsi - 50) / 50;

    const macd = await this.calculateMACD(prices);
    const macdSignal = macd > 0 ? Math.min(macd / 10, 1) : Math.max(macd / 10, -1);

    return rsiSignal * 0.5 + macdSignal * 0.5;
  }

  private async calculateVolatilityImpact(prices: number[]): Promise<number> {
    if (prices.length < 20) return 0;

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }

    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
    const vol = Math.sqrt(variance);
    const annualVol = vol * Math.sqrt(365);

    return Math.min(annualVol, 2);
  }

  private async analyzeVolume(volume: number[], prices: number[]): Promise<number> {
    if (!volume || volume.length < 5) return 0;

    const recentVol = volume.slice(-5).reduce((s, v) => s + v, 0) / 5;
    const priorVol = volume.slice(-10, -5).reduce((s, v) => s + v, 0) / 5;
    const volRatio = priorVol > 0 ? recentVol / priorVol : 1;

    const priceUp = prices.length > 1 && prices[prices.length - 1] > prices[prices.length - 2];

    if (volRatio > 1.5 && priceUp) return 0.5;
    if (volRatio > 1.5 && !priceUp) return -0.5;
    if (volRatio < 0.5) return -0.3;

    return (volRatio - 1);
  }

  private async analyzeSentiment(symbol: string): Promise<number> {
    const sentimentData = await this.context.get(`sentiment:social:all:${symbol}`);
    if (sentimentData) {
      return sentimentData.sentimentScore || 0;
    }
    return 0;
  }

  private determineDirection(trend: number, momentum: number, sentiment: number): 'up' | 'down' | 'sideways' {
    const weighted = trend * this.config.weights.trend + momentum * this.config.weights.momentum + sentiment * this.config.weights.sentiment;
    if (weighted > 0.1) return 'up';
    if (weighted < -0.1) return 'down';
    return 'sideways';
  }

  private calculateProbability(trend: number, momentum: number, volatility: number, volume: number, sentiment: number): number {
    const raw = (trend * 0.3 + momentum * 0.2 + (1 - volatility) * 0.15 + volume * 0.15 + sentiment * 0.2);
    return Math.max(0.1, Math.min(0.95, (raw + 1) / 2));
  }

  private calculateTargetPrice(prices: number[], direction: 'up' | 'down' | 'sideways', probability: number): number {
    const currentPrice = prices[prices.length - 1];
    const avgPrice = prices.reduce((s, p) => s + p, 0) / prices.length;
    const range = (Math.max(...prices) - Math.min(...prices)) / avgPrice;

    if (direction === 'up') return currentPrice * (1 + range * probability);
    if (direction === 'down') return currentPrice * (1 - range * probability);
    return currentPrice;
  }

  private calculateConfidence(probability: number, volatility: number): number {
    const baseConfidence = probability;
    const volPenalty = Math.min(volatility * 0.3, 0.3);
    return Math.max(0.1, Math.min(0.99, baseConfidence - volPenalty));
  }

  async predictEnsemble(input: PredictionInput): Promise<PredictionOutput[]> {
    const predictions: PredictionOutput[] = [];
    const methods = ['trend', 'momentum', 'volatility', 'volume'];

    for (const method of methods) {
      const pred = await this.predictWithMethod(input, method);
      predictions.push(pred);
    }

    return predictions;
  }

  private async predictWithMethod(input: PredictionInput, method: string): Promise<PredictionOutput> {
    return this.predict(input);
  }

  async backtest(symbol: string, prices: number[][], horizon: number): Promise<any> {
    const results = [];
    for (let i = horizon; i < prices.length; i++) {
      const trainPrices = prices.slice(0, i);
      const expectedOutcome = prices[i][prices[i].length - 1] > prices[i - 1][prices[i - 1].length - 1] ? 'up' : 'down';

      const input: PredictionInput = {
        symbol,
        prices: trainPrices.flatMap(p => p),
        volume: [],
        indicators: {},
        timeframe: '1h',
      };

      const prediction = await this.predict(input);
      results.push({ expected: expectedOutcome, predicted: prediction.direction, correct: expectedOutcome === prediction.direction });
    }

    const correct = results.filter(r => r.correct).length;
    return { accuracy: results.length > 0 ? correct / results.length : 0, total: results.length, correct, results };
  }

  private calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return prices.reduce((s, p) => s + p, 0) / prices.length;
    return prices.slice(-period).reduce((s, p) => s + p, 0) / period;
  }

  private async calculateMACD(prices: number[]): Promise<number> {
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    return ema12 - ema26;
  }

  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1];
    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((s, p) => s + p, 0) / period;
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    return ema;
  }

  getConfig(): ModelConfig { return { ...this.config }; }

  setWeights(weights: Record<string, number>): void {
    this.config.weights = { ...this.config.weights, ...weights };
  }

  resetCache(): void { this.predictionCache.clear(); }
}