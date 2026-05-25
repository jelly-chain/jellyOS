export { PredictionModel } from './PredictionModel';
export { VolatilityModel } from './VolatilityModel';
export { LiquidityModel } from './LiquidityModel';

export type { PredictionInput, PredictionOutput, ModelConfig } from './PredictionModel';
export type { VolatilityForecast, VolatilityRegime } from './VolatilityModel';
export type { LiquidityAnalysis, SlippageEstimate } from './LiquidityModel';

import { ContextStore } from '../context/ContextStore';
import { Metrics } from '../core/utils/Metrics';
import { PredictionModel } from './PredictionModel';
import { VolatilityModel } from './VolatilityModel';
import { LiquidityModel } from './LiquidityModel';

export class PredictionEngine {
  private predictionModel: PredictionModel;
  private volatilityModel: VolatilityModel;
  private liquidityModel: LiquidityModel;
  private logger: any;

  constructor(context: ContextStore, metrics: Metrics) {
    this.predictionModel = new PredictionModel(context, metrics);
    this.volatilityModel = new VolatilityModel(metrics);
    this.liquidityModel = new LiquidityModel(metrics);
    this.logger = { info: (msg: string) => console.log(`[PredictionEngine] ${msg}`) };
  }

  getPredictionModel(): PredictionModel { return this.predictionModel; }
  getVolatilityModel(): VolatilityModel { return this.volatilityModel; }
  getLiquidityModel(): LiquidityModel { return this.liquidityModel; }
}

export const createPredictionEngine = (context: ContextStore, metrics: Metrics) => new PredictionEngine(context, metrics);