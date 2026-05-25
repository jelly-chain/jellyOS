import { TestHelpers } from './TestHelpers';
export { TestHelpers } from './TestHelpers';

export class TestSuite {
  static async runAll(): Promise<{ passed: number; failed: number; total: number }> {
    const tests = [
      { name: 'Core Services', run: () => this.testCore() },
      { name: 'Agents', run: () => this.testAgents() },
      { name: 'Prediction', run: () => this.testPrediction() },
      { name: 'Trading', run: () => this.testTrading() },
      { name: 'Blockchain', run: () => this.testBlockchain() },
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      try {
        await test.run();
        console.log(`  ✓ ${test.name}`);
        passed++;
      } catch (error) {
        console.error(`  ✗ ${test.name}:`, error);
        failed++;
      }
    }

    return { passed, failed, total: tests.length };
  }

  private static async testCore(): Promise<void> {
    const taskQueue = TestHelpers.createTestTaskQueue();
    const task = { id: 'test-1', type: 'test', priority: 1, payload: {}, createdAt: Date.now(), status: 'pending' as any, retries: 0, maxRetries: 3, timeout: 5000, dependencies: [] };
    taskQueue.enqueue(task);
    if (taskQueue.getPendingCount() !== 0) throw new Error('Task queue should have 0 pending');
  }

  private static async testAgents(): Promise<void> {
    const context = TestHelpers.createTestContext();
    const metrics = TestHelpers.createTestMetrics();
    const taskQueue = TestHelpers.createTestTaskQueue();
    const checkpoints = TestHelpers.createTestCheckpointManager();

    const { IndicatorAgent } = require('../../agents/IndicatorAgent');
    const agent = new IndicatorAgent('test-indicator', { context, taskQueue, metrics, checkpoints });

    const prices = TestHelpers.createMockPrices();
    const rsi = await agent.calculateRSI('TEST', prices);
    if (rsi.rsi < 0 || rsi.rsi > 100) throw new Error('RSI outside valid range');
  }

  private static async testPrediction(): Promise<void> {
    const context = TestHelpers.createTestContext();
    const metrics = TestHelpers.createTestMetrics();
    const { PredictionModel } = require('../../prediction/PredictionModel');
    const model = new PredictionModel(context, metrics);
    const prices = TestHelpers.createMockPrices();
    const result = await model.predict({ symbol: 'TEST', prices, volume: [], indicators: {}, timeframe: '1h' });
    if (!result.direction) throw new Error('Prediction missing direction');
  }

  private static async testTrading(): Promise<void> {
    const { PositionManager } = require('../../trading/PositionManager');
    const metrics = TestHelpers.createTestMetrics();
    const pm = new PositionManager(metrics);
    const pos = pm.openPosition({ symbol: 'TEST', side: 'long', entryPrice: 100, quantity: 10 });
    if (pos.status !== 'open') throw new Error('Position should be open');
    pm.closePosition(pos.id, 110);
    if (pm.getClosedPositions().length !== 1) throw new Error('Should have 1 closed position');
  }

  private static async testBlockchain(): Promise<void> {
    const { BlockchainManager } = require('../../blockchain/BlockchainManager');
    const metrics = TestHelpers.createTestMetrics();
    const bm = new BlockchainManager(metrics);
    const chains = bm.getAllChains();
    if (chains.length < 20) throw new Error('Should have 20+ chains');
  }
}