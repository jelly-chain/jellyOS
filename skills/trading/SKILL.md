---
name: trading
description: Execute trades, manage positions, and run trading strategies on DEXs
---

# JellyOS Trading Skill

Use this skill when the user wants to trade, manage positions, or run automated strategies.

## Workflow

1. **Assess** — call `get_market_data` for current price, `get_funding_rates` for perp sentiment
2. **Size** — call `calculate_risk` with entry, stop, and target prices
3. **Confirm** — always show the trade summary and wait for explicit confirmation before calling `execute_trade`
4. **Monitor** — after execution, call `set_stop_loss` and note position in context
5. **Sweep** — after taking profit, call `vault_sweep` to secure gains

## Risk Rules

- Max position size: 5% of portfolio per trade
- Minimum R/R ratio: 1.5:1 before entering
- Always set a stop-loss before or immediately after entry
- Leverage > 3x: requires explicit user override

## DEX Routing

- **Solana** → Jupiter aggregator (best execution)
- **Ethereum/L2** → Uniswap v3 (or 1inch for large orders)
- **BNB Chain** → PancakeSwap

## Common Strategies

### DCA (Dollar-Cost Averaging)
Split position into 3–5 entries over time. Good for high-conviction, uncertain timing.

### Grid Trading
Set buy/sell orders at regular intervals. Use `calculate_risk` to set grid levels.

### Trend Follow
Enter on pullbacks to key moving averages. Use `get_signals` to confirm direction.
