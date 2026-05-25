---
name: analysis
description: Multi-signal market analysis combining on-chain data, sentiment, and price action
---

# JellyOS Market Analysis Skill

Use this skill for comprehensive market assessments before making trading decisions.

## Analysis Framework

Always gather data in this order:

1. **Price & Volume** — `get_market_data` for top assets
2. **Sentiment** — `get_fear_greed` index score
3. **Derivatives** — `get_funding_rates` for any perp overextension
4. **On-Chain** — `scan_chain` for whale movements, `get_defi_tvl` for capital flows
5. **News** — `get_news` for major catalysts
6. **Signals** — `get_signals` for cross-source signal confluence

## Interpretation Guide

| F&G Score | Reading | Action Bias |
|-----------|---------|-------------|
| 0–24      | Extreme Fear | Contrarian buy zone |
| 25–49     | Fear | Cautious accumulation |
| 50–74     | Greed | Neutral, wait for pullback |
| 75–100    | Extreme Greed | Reduce longs, tighten stops |

| Funding Rate | Signal |
|-------------|--------|
| > +0.1%     | Longs overextended — bearish near-term |
| < -0.05%    | Shorts overextended — bullish squeeze risk |
| -0.05 to +0.1% | Normal — trend is valid |

## Output Format

Always structure analysis as:
- **Verdict**: BULLISH / BEARISH / NEUTRAL (with timeframe)
- **Confidence**: 0–100%
- **Key Data Points**: 3–5 bullet points of supporting evidence
- **Trade Setup**: entry range, stop, target (if actionable)
- **Risk**: what would invalidate the thesis
