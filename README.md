# @jellyos/agent

<div align="center">

<pre>
     ██╗███████╗██╗     ██╗  ██╗   ██╗  ██████╗ ███████╗
     ██║██╔════╝██║     ██║  ╚██╗ ██╔╝ ██╔═══██╗██╔════╝
     ██║█████╗  ██║     ██║   ╚████╔╝  ██║   ██║███████╗
██   ██║██╔══╝  ██║     ██║    ╚██╔╝   ██║   ██║╚════██║
╚█████╔╝███████╗███████╗███████╗██║    ╚██████╔╝███████║
 ╚════╝ ╚══════╝╚══════╝╚══════╝╚═╝     ╚═════╝ ╚══════╝
</pre>


[![npm](https://img.shields.io/npm/v/@jellyos/agent?color=14b8a6&style=flat-square)](https://www.npmjs.com/package/@jellyos/agent)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=flat-square)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow?style=flat-square)](LICENSE)

[Website](http://jelly-os.xyz/) • [Telegram](https://t.me/jellyxchain) • [X / Twitter](https://x.com/agentz010) • [API](https://jellychain.fun) •
[Claude Wrapper](https://github.com/jelly-chain/jelly-claude) • [PI Extention](https://github.com/jelly-chain/jellyOS-PI-Framework) • [NPM](https://www.npmjs.com/package/@jellyos/agent) • [NPM Docs](https://github.com/jelly-chain/JellyOS-NPM)

</div>

---

## What is JellyOS?

JellyOS is an AI trading agent that runs entirely in your terminal. It connects to AI model providers and blockchain data APIs through outbound HTTP calls only — nothing is hosted, nothing listens for inbound connections, and your keys never leave your machine.

```
Your machine
├── jellyos (CLI)
│   ├── Ink TUI             ← streaming terminal UI
│   ├── AgentRunner         ← model loop + tool dispatcher
│   ├── SwarmRouter         ← parallel sub-agent orchestration
│   ├── FeedManager         ← 21 live data sources (background)
│   ├── SignalEngine        ← cross-feed trading signals
│   ├── WalletManager       ← EVM / Solana / Cosmos keypairs
│   ├── VaultManager        ← AES-256-GCM encrypted profit vault
│   └── DashboardServer     ← optional local WebSocket dashboard
│
├── ~/.jellyos/
│   ├── .env                ← your API keys
│   ├── wallets/            ← local keypairs (never synced)
│   ├── vault/              ← encrypted vault file
│   └── context.json        ← session state, watchlist, positions
│
└── Outbound only:
    ├── openrouter.ai           ← AI model gateway (your key)
    ├── api.coingecko.com       ← prices, trending
    ├── api.binance.com         ← 24h tickers
    ├── api.llama.fi            ← DeFi TVL
    ├── alchemy.com             ← on-chain data (optional key)
    ├── mempool.space           ← BTC mempool
    ├── etherscan.io            ← ETH gas
    └── ... 15 more sources
```

---

## Install

```bash
npm install -g @jellyos/agent
```

---

## Using the Full JellyOS Stack

For wallets, vault, live feeds, and all 28 trading tools:

```bash
# Clone the full project
git clone https://github.com/jelly-chain/JellyOS.git
cd JellyOS

# Install dependencies
npm install

# Run one-command setup (generates wallets, vault ceremony, writes ~/.jellyos/.env)
bash setup.sh      # macOS / Linux
# or
powershell -ExecutionPolicy Bypass -File setup.ps1   # Windows

# Launch — auto-detects extensions/jellyos.ts
jellyos
```

---

## Configuration

All config lives in `~/.jellyos/.env`. The setup wizard creates this for you, or create it manually:

```bash
cp .env.example ~/.jellyos/.env
nano ~/.jellyos/.env
```

### AI Model Provider (pick one)

| Variable | Provider | Example models |
|----------|----------|----------------|
| `OPENROUTER_API_KEY` | OpenRouter (recommended) | `anthropic/claude-sonnet-4-5` |
| `ANTHROPIC_API_KEY` | Anthropic direct | `claude-sonnet-4-5-20251101` |
| `OPENAI_API_KEY` | OpenAI | `gpt-4o` |
| `OPENAI_BASE_URL` | Local (Ollama / LM Studio) | `http://localhost:11434/v1` |

### Model Pool (optional — up to 5 models)

Configure a named pool. JellyOS rotates through them automatically on rate-limits or errors:

```env
JELLY_MODEL_1=anthropic/claude-sonnet-4-5    # primary
JELLY_MODEL_2=openai/gpt-4o-mini             # secondary
JELLY_MODEL_3=google/gemini-flash-1.5        # tertiary
JELLY_MODEL_4=meta-llama/llama-3-8b-instruct:free  # budget / eco
JELLY_MODEL_5=deepseek/deepseek-chat         # swarm fallback
```

If not set, JellyOS uses built-in defaults for your provider.

### Data & Chain APIs (optional)

| Variable | Description |
|----------|-------------|
| `ALCHEMY_KEY` | On-chain balances, gas, whale scanning across 16 EVM chains |
| `COINGLASS_API_KEY` | Funding rates + open interest (broader exchange coverage) |
| `DUNE_API_KEY` | Dune Analytics whale wallet tracking |
| `GLASSNODE_API_KEY` | On-chain metrics (active addresses, SOPR) |
| `POLYMARKET_API_KEY` | Prediction market data and trading |

### Vault & Agent Behaviour

| Variable | Default | Description |
|----------|---------|-------------|
| `JELLY_EFFECT_LEVEL` | `normal` | Default power level: `eco` / `normal` / `turbo` / `max` |
| `AUTO_VAULT_THRESHOLD` | `500` | Auto-sweep P&L to vault when this USD amount is exceeded |
| `JELLY_DASHBOARD_PORT` | `4320` | WebSocket port for the local dashboard |
| `JELLY_MAX_AGENTS` | `5` | Max parallel sub-agents in swarm mode |

---

## Effect Levels

Switch at any time with `/effect <level>`. Takes effect immediately on your next message.

| Level | Power | Swarm | Best For |
|-------|-------|-------|----------|
| `eco` | 30% | Off | Quick balance checks, simple questions |
| `normal` | 50% | Off | Default — most everyday tasks |
| `turbo` | 70% | 2 agents | Analysis + signal generation in parallel |
| `max` | 100% | 5 agents | Multi-chain deep research, complex strategies |

**How swarm works (`turbo` / `max`):**
Complex prompts are automatically scored using a conjunction + action-verb heuristic. When the score crosses the threshold, the prompt is decomposed into 2–5 focused sub-tasks. Sub-tasks run in groups of 3 (parallel within each group, groups run sequentially). A reviewer model then synthesises all results into a single coherent answer.

---

## Live Data Feeds

JellyOS polls 21 sources in the background and injects relevant data into every agent turn:

| Source | Interval | Data |
|--------|----------|------|
| CoinGecko prices | 5 min | Top asset prices + 24h change |
| Binance tickers | 2 min | Top 8 USDT pairs by volume |
| CoinGecko trending | 30 min | 7 trending coins |
| Fear & Greed Index | 1 hr | Alternative.me sentiment score |
| DeFiLlama TVL | 1 hr | Total TVL by chain |
| DeFiLlama protocols | 1 hr | Top TVL movers |
| Global market cap | 1 hr | BTC dominance, total cap, 24h change |
| Messari RSS | 10 min | Latest news headlines |
| CoinTelegraph RSS | 10 min | Latest news headlines |
| Coinglass funding rates | 15 min | BTC funding rates across exchanges |
| Coinglass open interest | 15 min | BTC OI aggregate |
| Etherscan gas | 1 min | ETH base / fast / slow gas |
| Reddit sentiment | 30 min | r/CryptoCurrency hot posts |
| Solana TPS | 5 min | Network transactions per second |
| BTC mempool | 3 min | Pending txs + fee rates |
| Polymarket trends | 30 min | Trending prediction markets |
| Whale watch | 10 min | Large on-chain movements (Alchemy) |
| Dune Analytics | 1 hr | Whale wallet tracker (API key required) |
| Glassnode | 1 hr | BTC active addresses (API key required) |
| CryptoCompare social | 2 hr | Twitter / Reddit social stats |
| Kalshi markets | 30 min | Prediction market odds |

---

## REPL Commands

```
/help                   List all available commands
/effect [level]         Set effect level: eco | normal | turbo | max
/vault                  Show encrypted vault balance
/unlock <passphrase>    Unlock the vault for sweeps
/lock                   Lock the vault immediately
/agents                 Show live swarm routing status
/feeds                  Show feed statistics (last fetch, item count)
/wallets                Show all wallet addresses (EVM / Solana / Cosmos)
/signals                Request current trading signals from signal engine
/status                 Full system health check (feeds, vault, model, wallets)
/clear                  Clear conversation history
/panic                  Emergency stop — closes all positions, sweeps vault, locks, halts feeds
/exit                   Quit JellyOS
```

---

## Tools Reference

The AI calls these tools automatically. You can also ask for them in plain language.

| Tool | Description |
|------|-------------|
| `get_balance` | Wallet balance on any supported chain |
| `get_wallet_addresses` | All generated wallet addresses |
| `sign_transaction` | Sign a tx hex in-memory (key never broadcast) |
| `vault_status` | Vault balance + lock state + entry count |
| `vault_sweep` | Move profits from trading account into vault |
| `vault_history` | Last 50 vault entries |
| `get_live_feeds` | Latest items from all active feed sources |
| `get_signals` | Active directional signals from the signal engine |
| `get_fear_greed` | Crypto Fear & Greed Index (current + 7d history) |
| `get_funding_rates` | Perpetual funding rates across exchanges |
| `get_market_data` | Prices + 24h change for up to 10 assets |
| `get_defi_tvl` | DeFiLlama TVL by chain or protocol |
| `get_gas_prices` | Gas prices across EVM chains |
| `scan_chain` | Scan recent blocks for large whale transactions |
| `get_polymarket` | Trending prediction markets + current odds |
| `predict_market` | AI-generated price prediction for an asset |
| `execute_trade` | Submit a swap (requires explicit user confirmation) |
| `get_positions` | List all open positions |
| `get_portfolio` | Full portfolio summary with P&L |
| `calculate_risk` | Risk/reward ratio + recommended position size |
| `set_stop_loss` | Update a stop-loss level |
| `execute_skill` | Run a saved trading strategy |
| `list_skills` | Show available strategy skills |
| `get_system_status` | Health check for all agent subsystems |
| `get_context` | Read persistent session context |
| `set_context` | Write persistent session context |
| `get_news` | Latest crypto news headlines |
| `get_chain_list` | All supported chains with IDs |

---

## Supported Chains

Ethereum, BSC, Arbitrum, Base, Polygon, Avalanche, Optimism, Scroll, Linea, zkSync Era, Mantle, Blast, Solana, Cosmos, and more via Alchemy and public RPCs.

---

## Local Dashboard

An optional React dashboard connects to the agent over WebSocket and shows live data:

```bash
cd dashboard
npm install
npm run dev
# Open http://localhost:4321
```

Real-time events pushed from the agent:

| Event | Description |
|-------|-------------|
| `feed_item` | New item from any live feed |
| `log_entry` | Agent / tool conversation messages |
| `trade_executed` | A trade was submitted |
| `vault_sweep` | Auto-vault swept profits |
| `swarm_update` | Sub-agent start / complete events |
| `signal_update` | New trading signal generated |
| `vault_update` | Vault balance changed |
| `panic` | Emergency stop triggered |

---

## Extension API

Build your own tools, commands, and hooks that run inside the JellyOS agent loop:

```typescript
import { Type } from "@jellyos/agent";
import type { ExtensionAPI } from "@jellyos/agent";

export default function (agent: ExtensionAPI) {
  // Set the AI's system prompt
  agent.setSystemPrompt("You are a DeFi yield optimizer.");

  // Register a slash command
  agent.registerCommand("yields", {
    description: "Show top yield opportunities",
    async handler(_args, ctx) {
      ctx.ui.notify("Fetching yields...");
    },
  });

  // Register a tool the AI can call automatically
  agent.registerTool({
    name:        "get_apy",
    label:       "Get APY",
    description: "Fetch current APY for a DeFi protocol",
    parameters:  Type.Object({
      protocol: Type.String({ description: "Protocol name, e.g. aave" }),
    }),
    async execute(_id, { protocol }) {
      const res  = await fetch(`https://api.llama.fi/protocol/${protocol}`);
      const data = await res.json() as any;
      return {
        content: [{ type: "text", text: `APY data for ${protocol}: ${JSON.stringify(data.apy)}` }],
        details: {},
      };
    },
  });

  // Lifecycle hooks
  agent.on("session_start", async (ctx) => {
    ctx.ui.setStatus("yields", "ready");
    ctx.ui.notify("Yield optimizer loaded.");
  });

  agent.on("session_end", async () => {
    // cleanup
  });
}
```

Load your extension at startup:

```bash
jellyos --extension ./my-extension.ts
```

---

## CLI Reference

```bash
jellyos                               # interactive TUI (auto-loads extensions/)
jellyos --extension /path/to/ext.ts   # load a specific extension file
jellyos --prompt /path/to/system.md   # override system prompt from file
jellyos config                        # show current config (keys masked)
jellyos setup                         # run the setup wizard
```

---

## Security

- **Keys stay local** — API keys are read from `~/.jellyos/.env` at startup and never logged or transmitted beyond outbound API calls
- **Private keys never leave the process** — signing happens in memory; only the resulting signature is returned
- **Vault encryption** — AES-256-GCM with a key derived from your passphrase using scrypt (memory-hard KDF) + random per-vault salt; the key itself is never persisted
- **Auto-lock** — vault locks automatically on `/panic` and on process exit
- **Wallet storage** — keypairs are written to `~/.jellyos/wallets/` which is in `.gitignore` and never included in any sync or backup by the agent

---

## License

MIT — see [LICENSE](LICENSE)
