# JellyOS API Guide

## Architecture Overview

JellyOS is built around a multi-agent architecture. The system is composed of:

- **Core Services** — Configuration, task queue, checkpoint manager
- **Agent Swarm** — Specialized agents that collaborate on predictions and decisions
- **Prediction Engine** — Statistical and ML models for market prediction
- **Trading System** — Order execution, position management, risk controls
- **Blockchain Layer** — Multi-chain RPC clients and prediction market integrations

## Core API

### Initialization

```typescript
import { JellyOS } from '@jellyos/core';

const jellyos = new JellyOS('./config/config.json');
await jellyos.initialize();
```

### Configuration

```typescript
const config = jellyos.getBrain().getConfig();
config.system.mode // 'production' | 'development' | 'test'
config.trading.maxSlippage // 0.01 = 1%
config.blockchain.chains // string[]
```

### Context Store

```typescript
const context = jellyos.getContext();
await context.set('key', { data: 'value' }, 3600); // TTL in seconds
const value = await context.get('key');
context.delete('key');
```

## Agent API

### Creating Agents

```typescript
import { BlockchainAgent, SentimentAgent } from '@jellyos/core';

const blockchainAgent = new BlockchainAgent('agent-1', {
  context: jellyos.getContext(),
  taskQueue: jellyos.getBrain().getTaskQueue(),
  metrics: jellyos.getMetrics(),
  checkpoints: jellyos.getBrain().getCheckpoints(),
});

await blockchainAgent.initialize();
```

### Executing Tasks

```typescript
const result = await blockchainAgent.execute({
  type: 'track-whales',
  networks: ['ethereum', 'bsc', 'solana'],
  minValue: 100000,
});
```

## Prediction API

```typescript
const engine = jellyos.getPrediction();

// Price prediction
const prediction = await engine.getPredictionModel().predict({
  symbol: 'BTC',
  prices: [/* price history */],
  volume: [/* volume data */],
  indicators: {},
  timeframe: '1h',
});

// Volatility forecast
const volatility = await engine.getVolatilityModel().forecast('BTC', prices);

// Liquidity analysis
const liquidity = await engine.getLiquidityModel().analyzeLiquidity(symbol, orderBook, volume24h);
```

## Trading API

```typescript
const trading = jellyos.getTrading();

// Open position
const position = trading.getPositionManager().openPosition({
  symbol: 'SOL',
  side: 'long',
  entryPrice: 150,
  quantity: 10,
  stopLoss: 140,
  takeProfit: 175,
});

// Execute trade
const order = await trading.getTradeExecutor().executeOrder({
  id: 'order-1',
  symbol: 'SOL',
  side: 'buy',
  type: 'market',
  quantity: 10,
  slippage: 0.01,
  strategy: 'momentum',
  status: 'pending',
  fills: [],
});

// Risk check
const riskCheck = trading.getRiskManager().canOpenPosition('SOL', 10000, 1, 100000);

// Portfolio summary
const summary = trading.getPortfolioManager().getSummary();
```

## CLI API

```typescript
import { cli } from '@jellyos/core';

// Execute command
await cli.getHandler().handleInput('status');

// Register custom command
cli.getRegistry().register({
  name: 'custom',
  description: 'Custom command',
  usage: 'custom <args>',
  aliases: [],
  category: 'system',
  execute: async (args) => { console.log('Custom command:', args); },
});
```

## Blockchain API

```typescript
const blockchain = jellyos.getBlockchain();

// Chain info
const chain = blockchain.getManager().getChain('solana');
console.log(chain.rpcUrl);

// Prediction markets
const markets = blockchain.getMarkets();
const polymarket = markets.getPolymarket();
const events = await polymarket.getMarkets();

// Solana client
import { SolanaClient } from '@jellyos/core';
const solana = new SolanaClient();
const balance = await solana.getBalance('address');
```

## Error Handling

```typescript
try {
  await jellyos.initialize();
} catch (error) {
  console.error('Initialization failed:', error);
}
```

## Graceful Shutdown

```typescript
process.on('SIGINT', async () => {
  await jellyos.shutdown();
  process.exit(0);
});
```