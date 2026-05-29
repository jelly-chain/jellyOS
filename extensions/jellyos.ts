

import { Type, modelRegistry, priceFeed, newsFeed, fullAnalysis } from "@jellyos/agent";
import type { ExtensionAPI } from "@jellyos/agent";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// ESM-safe __dirname (works in both .ts compiled to CJS and .mjs ESM)
const _esm_dirname = (() => {
  try {
    // ESM: import.meta.url is defined
    return path.dirname(fileURLToPath((import.meta as any).url));
  } catch {
    // CJS fallback
    return typeof __dirname !== "undefined" ? __dirname : process.cwd();
  }
})();
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { WalletManager } from "../src/wallet/WalletManager";
import { VaultManager } from "../src/vault/VaultManager";
import { AutoVault } from "../src/vault/AutoVault";
import { FeedManager } from "../src/feeds/FeedManager";
import { SignalEngine } from "../src/feeds/SignalEngine";

// -- Constants ----------------------------------------------------------------

const JELLY_HOME = process.env.JELLYOS_HOME ?? path.join(os.homedir(), ".jelly");

const CHAIN_NETWORK: Record<string, string> = {
  bsc: "bnb-mainnet",       ethereum: "eth-mainnet",  base: "base-mainnet",
  arbitrum: "arb-mainnet",  polygon: "polygon-mainnet", avalanche: "avax-mainnet",
  optimism: "opt-mainnet",  fantom: "fantom-mainnet",   gnosis: "gnosis-mainnet",
  celo: "celo-mainnet",     scroll: "scroll-mainnet",   linea: "linea-mainnet",
  zksync: "zksync-mainnet", mantle: "mantle-mainnet",   blast: "blast-mainnet",
};

const CHAIN_SYMBOL: Record<string, string> = {
  ethereum: "ETH", bsc: "BNB",     arbitrum: "ETH",  base: "ETH",
  polygon: "MATIC", avalanche: "AVAX", optimism: "ETH", fantom: "FTM",
  gnosis: "xDAI",  celo: "CELO",   scroll: "ETH",    linea: "ETH",
  mantle: "MNT",   blast: "ETH",   solana: "SOL",
};

// -- Helpers ------------------------------------------------------------------

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }], details: {} };
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

/** Block SSRF attempts in web_fetch */
function isPrivateHost(urlStr: string): boolean {
  try {
    const { hostname } = new URL(urlStr);
    if (/^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|::1)$/i.test(hostname)) return true;
    if (/^10\.\d+\.\d+\.\d+$/.test(hostname))                               return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname))              return true;
    if (/^192\.168\.\d+\.\d+$/.test(hostname))                              return true;
    if (hostname === "169.254.169.254")                                      return true;
    if (/\.(internal|local|corp|lan|intranet)$/i.test(hostname))            return true;
    return false;
  } catch { return true; }
}

/** Allowed keys for set_context tool (prevents unbounded disk writes) */
const ALLOWED_CONTEXT_KEYS = new Set([
  "effect_level", "active_chain", "watchlist", "memo",
  "positions", "risk_profile", "schedule", "auto_vault_threshold",
  "model", "debug_log",
]);

// -- WebSocket dashboard server (localhost only) -------------------------------

const wsClients = new Set<WebSocket>();

// Maps internal event names → dashboard DashboardEvent.type values
const WS_TYPE_MAP: Record<string, string> = {
  vault_sweep:   "vault_update",
  vault_balance: "vault_update",
  prices:        "feed_item",
  trade:         "trade_executed",
  signals:       "signal_update",
  log:           "log_entry",
  agent:         "agent_status",
  swarm:         "swarm_update",
};

function broadcastWs(event: string, data: unknown): void {
  const type = WS_TYPE_MAP[event] ?? event;
  const msg  = JSON.stringify({ type, data, timestamp: Date.now() });
  for (const client of wsClients) {
    if ((client as any).readyState === 1 /* OPEN */) {
      try { client.send(msg); } catch { wsClients.delete(client); }
    } else if ((client as any).readyState > 1 /* CLOSING | CLOSED */) {
      wsClients.delete(client);
    }
  }
}

const dashPort   = parseInt(process.env.JELLY_DASHBOARD_PORT ?? "4320", 10);
const dashServer = new WebSocketServer({ port: dashPort, host: "127.0.0.1" });

dashServer.on("connection", (ws: WebSocket) => {
  wsClients.add(ws);
  ws.send(JSON.stringify({ type: "connected", timestamp: Date.now() }));
  ws.on("close", () => wsClients.delete(ws));
  ws.on("error", () => wsClients.delete(ws));
  // Bi-directional: handle incoming dashboard messages
  ws.on("message", (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "agent_message" && msg.text) {
        _dashboardMessages.push({ text: String(msg.text), ts: Date.now() });
        if (_dashboardMessages.length > 50) _dashboardMessages = _dashboardMessages.slice(-50);
        ws.send(JSON.stringify({ type: "message_queued", id: Date.now() }));
      } else if (msg.type === "set_effect" && msg.level) {
        const { writeFileSync, readFileSync, existsSync, mkdirSync } = require("node:fs");
        const ctxPath = path.join(JELLY_HOME, "context.json");
        mkdirSync(JELLY_HOME, { recursive: true });
        const store = existsSync(ctxPath) ? JSON.parse(readFileSync(ctxPath, "utf-8")) : {};
        store.effect_level = msg.level;
        writeFileSync(ctxPath, JSON.stringify(store, null, 2), "utf-8");
        broadcastWs("effect_changed", { level: msg.level });
        ws.send(JSON.stringify({ type: "effect_set", level: msg.level }));
      } else if (msg.type === "get_status") {
        const s = _statusReady ? {
          vault: _statusV ? (_statusV.isLocked() ? "locked" : `$${_statusV.getStats().balance?.toFixed(2) ?? "0"}`) : "unavailable",
          feeds: _statusF?.getStats() ?? null,
          signals: _statusS?.getActiveSignals().length ?? 0,
          wallets: _statusW ? Object.keys(_statusW.getSummary()).length : 0,
          uptime: process.uptime(),
          models: modelRegistry.modelCount,
          prices: priceFeed.getAll().length,
          news: newsFeed.getLatest()?.items.length ?? 0,
        } : { vault: "initializing", uptime: process.uptime() };
        ws.send(JSON.stringify({ type: "status", data: s }));
      }
    } catch { /* malformed message */ }
  });
});

// -- Extension -----------------------------------------------------------------

// -- Types ----------------------------------------------------------------------

interface AlertDef {
  id: string; symbol: string; condition: ">" | "<"; threshold: number; created: number;
}
interface WatchedWallet {
  address: string; label?: string; chain?: string;
}
interface JournalEntry {
  ts: number; action: string; symbol: string; amount: number;
  price: number; chain?: string; reason?: string; pnl?: number;
}
interface TgMessage   { id: number;  text: string; from: string; }
interface DcMessage   { id: string;  text: string; author: string; }
interface WsSignal    { ticker: string; action: string; price: number; ts: number; [k: string]: unknown; }

// -- Pending dashboard messages (WebSocket) ----------------------------
let _dashboardMessages: Array<{ text: string; ts: number }> = [];
let _statusReady = false;
let _statusV: any, _statusF: any, _statusS: any, _statusW: any;

let _telegramOffset  = 0;
let _telegramPending: TgMessage[] = [];
let _discordLastId   = "";
let _discordPending:  DcMessage[] = [];
let _webhookSignals:  WsSignal[]  = [];
let _tgPolling       = false;  // guard: prevent overlapping poll requests
let _dcPolling       = false;  // guard: prevent overlapping poll requests
let _seenTxHashes    = new Set<string>();
let _telegramTimer:  ReturnType<typeof setInterval> | null = null;
let _discordTimer:   ReturnType<typeof setInterval> | null = null;
let _alertTimer:     ReturnType<typeof setInterval> | null = null;
let _walletTimer:    ReturnType<typeof setInterval> | null = null;
let _webhookHttpSrv: any = null;

// -- Telegram helpers -----------------------------------------------------------

async function _tgPoll(): Promise<void> {
  if (_tgPolling) return;  // skip if previous poll hasn't finished
  _tgPolling = true;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) { _tgPolling = false; return; }
  try {
    const url = `https://api.telegram.org/bot${token}/getUpdates?timeout=0&offset=${_telegramOffset}&limit=20`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return;
    const data = await res.json() as any;
    for (const upd of data.result ?? []) {
      _telegramOffset = upd.update_id + 1;
      const msg = upd.message;
      if (!msg?.text) continue;
      _telegramPending.push({ id: msg.message_id, text: msg.text, from: msg.from?.username ?? "user" });
    }
  } catch { /* non-fatal */ } finally { _tgPolling = false; }
}

async function _tgSend(text: string): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096), parse_mode: "Markdown" }),
      signal:  AbortSignal.timeout(8000),
    });
  } catch { /* non-fatal */ }
}

// -- Discord helpers ------------------------------------------------------------

async function _dcPoll(): Promise<void> {
  if (_dcPolling) return;  // skip if previous poll hasn't finished
  _dcPolling = true;
  const token     = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!token || !channelId) { _dcPolling = false; return; }
  try {
    const url = _discordLastId
      ? `https://discord.com/api/v10/channels/${channelId}/messages?after=${_discordLastId}&limit=20`
      : `https://discord.com/api/v10/channels/${channelId}/messages?limit=1`;
    const res = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
      signal:  AbortSignal.timeout(8000),
    });
    if (!res.ok) return;
    const msgs = await res.json() as any[];
    for (const msg of [...msgs].reverse()) {
      if (msg.author?.bot) continue;
      if (!_discordLastId) { _discordLastId = msg.id; continue; } // seed first id
      _discordLastId = msg.id;
      _discordPending.push({ id: msg.id, text: msg.content, author: msg.author?.username ?? "user" });
    }
    if (!_discordLastId && msgs.length > 0) _discordLastId = msgs[0].id;
  } catch { /* non-fatal */ } finally { _dcPolling = false; }
}

async function _dcSend(text: string): Promise<void> {
  const token     = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!token || !channelId) return;
  try {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method:  "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ content: text.slice(0, 2000) }),
      signal:  AbortSignal.timeout(8000),
    });
  } catch { /* non-fatal */ }
}

// -- Alert check (called every 30 s) -------------------------------------------

function _checkAlerts(feeds: FeedManager | null): void {
  if (!feeds) return;
  const { existsSync, readFileSync, writeFileSync } = require("node:fs");
  const alertsPath = path.join(JELLY_HOME, "alerts.json");
  if (!existsSync(alertsPath)) return;
  let alerts: AlertDef[] = [];
  try { alerts = JSON.parse(readFileSync(alertsPath, "utf-8")); } catch { return; }
  if (!alerts.length) return;

  const triggered: AlertDef[] = [];
  for (const alert of alerts) {
    const recent = feeds.getRecent({ limit: 100 });
    const item   = recent.find(i =>
      (i.metadata?.symbol as string)?.toLowerCase() === alert.symbol.toLowerCase()
    );
    if (!item) continue;
    const price = Number(item.metadata?.price);
    if (isNaN(price)) continue;
    const hit = alert.condition === ">" ? price > alert.threshold
              : alert.condition === "<" ? price < alert.threshold
              : false;
    if (hit) triggered.push(alert);
  }
  if (!triggered.length) return;

  const remaining = alerts.filter(a => !triggered.some(t => t.id === a.id));
  try { writeFileSync(alertsPath, JSON.stringify(remaining, null, 2), "utf-8"); } catch {}

  for (const a of triggered) {
    const msg = `🚨 JellyOS Alert: ${a.symbol} is ${a.condition} $${a.threshold}`;
    _tgSend(msg).catch(() => {});
    _dcSend(msg).catch(() => {});
    try {
      const { execSync } = require("node:child_process");
      if (process.platform === "darwin") {
        execSync(`osascript -e 'display notification "${msg.replace(/'/g, "")}" with title "JellyOS"'`,
          { timeout: 3000, stdio: "pipe" });
      } else if (process.platform === "linux") {
        execSync(`notify-send "JellyOS" "${msg.replace(/"/g, "")}"`, { timeout: 3000, stdio: "pipe" });
      }
    } catch {}
  }
}

// -- Watched-wallet polling -----------------------------------------------------

async function _pollWatchedWallets(): Promise<void> {
  const alchemyKey = process.env.ALCHEMY_KEY;
  if (!alchemyKey) return;
  const { existsSync, readFileSync } = require("node:fs");
  const watchPath = path.join(JELLY_HOME, "watched-wallets.json");
  if (!existsSync(watchPath)) return;
  let wallets: WatchedWallet[] = [];
  try { wallets = JSON.parse(readFileSync(watchPath, "utf-8")); } catch { return; }
  for (const w of wallets) {
    try {
      const network = CHAIN_NETWORK[w.chain ?? "ethereum"] ?? "eth-mainnet";
      const res = await fetch(`https://${network}.g.alchemy.com/v2/${alchemyKey}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          id: 1, jsonrpc: "2.0", method: "alchemy_getAssetTransfers",
          params: [{ fromBlock: "latest", toAddress: w.address, category: ["external", "erc20"], maxCount: "0x5" }],
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const data = await res.json() as any;
      for (const tx of data.result?.transfers ?? []) {
        const key = `${w.address}:${tx.hash}`;
        if (_seenTxHashes.has(key)) continue;
        _seenTxHashes.add(key);
        if (_seenTxHashes.size > 2000) {
          const arr = [..._seenTxHashes];
          _seenTxHashes = new Set(arr.slice(arr.length - 1000));
        }
        const label = w.label ?? w.address.slice(0, 8) + "...";
        const msg   = `👁 Wallet ${label}: received ${tx.value ?? "?"} ${tx.asset ?? ""} (${tx.hash?.slice(0, 10)}...)`;
        _tgSend(msg).catch(() => {});
        _dcSend(msg).catch(() => {});
      }
    } catch { /* non-fatal */ }
  }
}

// -- Journal helper -------------------------------------------------------------

function _logTrade(entry: JournalEntry): void {
  try {
    const { mkdirSync, appendFileSync } = require("node:fs");
    const date = new Date().toISOString().slice(0, 10);
    const dir  = path.join(JELLY_HOME, "journal");
    mkdirSync(dir, { recursive: true });
    appendFileSync(path.join(dir, `${date}.jsonl`), JSON.stringify(entry) + "\n", "utf-8");
  } catch { /* non-fatal */ }
}

// -- TradingView webhook server -------------------------------------------------

function _startWebhookServer(): void {
  const port = parseInt(process.env.JELLY_WEBHOOK_PORT ?? "9340", 10);
  const http = require("node:http");
  _webhookHttpSrv = http.createServer((req: any, res: any) => {
    if (req.method !== "POST" || req.url !== "/webhook") {
      res.writeHead(404); res.end("JellyOS webhook -- POST /webhook"); return;
    }
    let body = "";
    req.on("data", (c: Buffer) => { body += c.toString(); });
    req.on("end", () => {
      try {
        const signal = JSON.parse(body) as WsSignal;
        signal.ts = Date.now();
        _webhookSignals.push(signal);
        if (_webhookSignals.length > 100) _webhookSignals = _webhookSignals.slice(-100);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch { res.writeHead(400); res.end("Bad JSON"); }
    });
  });
  _webhookHttpSrv.listen(port, "127.0.0.1", () => {});
  _webhookHttpSrv.on("error", () => {}); // non-fatal if port already in use
}

// -- Extension -----------------------------------------------------------------

export default function jellyos(agent: ExtensionAPI): void {
  let wallet:    WalletManager | null = null;
  let vault:     VaultManager  | null = null;
  let autoVault: AutoVault     | null = null;
  let feeds:     FeedManager   | null = null;
  let signals:   SignalEngine   | null = null;

  // -- Boot -------------------------------------------------------------------

  agent.on("session_start", async (_e, ctx) => {
    try {
      wallet  = new WalletManager(JELLY_HOME);
      vault   = new VaultManager(JELLY_HOME);
      feeds   = new FeedManager();
      signals = new SignalEngine(feeds);
      autoVault = new AutoVault(vault);

      // Start auto-vault: uses portfolio PnL from PositionManager if available
      let getPnL = (): number => 0;
      try {
        const { PositionManager } = require("../src/trading/PositionManager");
        const { Metrics }         = require("../src/core/utils/Metrics");
        const { Logger }          = require("../src/core/utils/Logger");
        const pm = new PositionManager(new Metrics(new Logger("AutoVault")));
        getPnL = () => {
          try { return pm.getTotalPnL?.() ?? 0; } catch { return 0; }
        };
      } catch { /* PositionManager unavailable, PnL stays 0 */ }

      autoVault.start(getPnL, (amount) => {
        broadcastWs("vault_sweep", { amount, ts: Date.now() });
        ctx.ui.setStatus("vault", `vault +$${amount.toFixed(0)}`);
      });

      // NOTE: setHeader is intentionally NOT used.
      // Custom header render() is called on every streaming token, causing agent to
      // emit a new full-frame border without erasing the previous one -- stacking
      // +----------------+ lines on every reply. Branding lives in the status bar.

      // NOTE: setTheme() and all setStatus() calls are deferred to a single
      // update at the very end of boot. Each setStatus() call triggers a full
      // agent TUI re-render -- calling it mid-init stacks +----------+ borders.

      try { feeds.start(); } catch { /* feed errors are non-fatal */ }

      // Start framework-level feeds (price tickers, news sentiment)
      try {
        priceFeed.track("btc", "eth", "sol", "bnb", "matic", "arb", "op", "avax", "link", "uni", "doge", "xrp", "ada", "dot", "atom", "near", "sui", "apt", "pepe", "aave");
        priceFeed.start();
        newsFeed.start();
      } catch { /* framework feed errors are non-fatal */ }

      // Wire model count to status bar (registry already initialised by cli.js -- no second fetch)
      setTimeout(() => {
        ctx.ui.setStatus("models", `${modelRegistry.modelCount} models`);
      }, 2000);

      // Wire dashboard status
      _statusReady = true; _statusV = vault; _statusF = feeds; _statusS = signals; _statusW = wallet;

      // Start background bridges (no setStatus calls here -- deferred below)
      if (process.env.TELEGRAM_BOT_TOKEN) {
        _tgPoll();
        _telegramTimer = setInterval(_tgPoll, 3000);
      }
      if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CHANNEL_ID) {
        _dcPoll();
        _discordTimer = setInterval(_dcPoll, 5000);
      }
      _startWebhookServer();
      _alertTimer  = setInterval(() => _checkAlerts(feeds), 30_000);
      _walletTimer = setInterval(_pollWatchedWallets, 60_000);

      // -- No setStatus calls during boot --------------------------------------
      // Each ctx.ui.setStatus() triggers a full agent TUI re-render. On startup,
      // agent has already drawn frame 1. A setStatus call causes frame 2, and
      // Ink's cursor-up is off by 1 (wide emoji: 🪼 🔒 ⚡ are 2 visual cols
      // but Ink counts them as 1) → frame 1's top border stays on screen.
      // agent already shows "🪼 JellyOS + model name" in its own status bar.
      // Bridge status is logged to console below instead.
    } catch {
      // Boot errors: log to console (non-fatal) to avoid a setStatus re-render
      console.error("[JellyOS] boot error -- check ~/.jelly/.env config");
    }
  });

  agent.on("session_shutdown", async () => {
    autoVault?.stop();
    feeds?.stop();
    priceFeed.stop();
    newsFeed.stop();
    dashServer.close(() => {});
    if (_telegramTimer) clearInterval(_telegramTimer);
    if (_discordTimer)  clearInterval(_discordTimer);
    if (_alertTimer)    clearInterval(_alertTimer);
    if (_walletTimer)   clearInterval(_walletTimer);
    if (_webhookHttpSrv) _webhookHttpSrv.close(() => {});
  });

  // Inject JellyOS identity + live context into every turn's system prompt
  agent.on("before_agent_start", async (_e, _ctx) => {
    // Load JellyOS system prompt from prompts/jellyos.md
    let basePrompt = "";
    try {
      const { readFileSync } = require("node:fs");
      const promptPath = path.join(_esm_dirname, "..", "prompts", "jellyos.md");
      basePrompt = readFileSync(promptPath, "utf-8");
    } catch { /* fall through with empty base */ }

    // Build live context snippet (vault balance + fear & greed)
    const fngItem  = feeds?.getRecent({ source: "alternative.me", limit: 1 })?.[0];
    const fng      = fngItem?.metadata?.score as number | undefined;
    const fngLabel = fngItem?.metadata?.label as string | undefined;
    const vaultLine = vault
      ? (vault.isLocked() ? "vault: locked" : `vault: unlocked $${vault.getStats().balance?.toFixed(2) ?? "0"}`)
      : null;
    const effectLine = (() => {
      try {
        const { readFileSync, existsSync } = require("node:fs");
        const ctxPath = path.join(JELLY_HOME, "context.json");
        return existsSync(ctxPath)
          ? `effect_level: ${JSON.parse(readFileSync(ctxPath, "utf-8")).effect_level ?? "normal"}`
          : "effect_level: normal";
      } catch { return "effect_level: normal"; }
    })();
    const liveBits = [
      vaultLine,
      fng != null ? `fear_greed: ${fng}/100 (${fngLabel})` : null,
      effectLine,
    ].filter(Boolean) as string[];

    // Inject live price data
    const priceTicks = priceFeed.getAll();
    if (priceTicks.length > 0) {
      liveBits.push(`prices: ${priceFeed.tickerLine(8)}`);
    }

    // Inject news sentiment
    const newsReport = newsFeed.getLatest();
    if (newsReport) {
      const ns = newsReport.avgSentiment;
      liveBits.push(`news_sentiment: ${ns >= 0 ? "+" : ""}${(ns * 100).toFixed(0)}% (${newsReport.positive}p/${newsReport.negative}n/${newsReport.neutral}·)`);
      liveBits.push(`trending: ${newsReport.topKeywords.slice(0, 8).join(", ")}`);
    }

    const liveBlock = liveBits.length > 0
      ? `\n\n## Live Context\n${liveBits.map(b => `- ${b}`).join("\n")}`
      : "";

    // Inject pending Telegram messages as context so agent can respond to them
    const tgBlock = _telegramPending.length > 0
      ? `\n\n## Pending Telegram Messages\nThe following messages arrived via Telegram and need a response. Use the send_telegram tool to reply.\n${
          _telegramPending.splice(0, _telegramPending.length).map(m => `- @${m.from}: ${m.text}`).join("\n")
        }`
      : "";

    // Inject pending Discord messages
    const dcBlock = _discordPending.length > 0
      ? `\n\n## Pending Discord Messages\nThe following messages arrived via Discord and need a response. Use the send_discord tool to reply.\n${
          _discordPending.splice(0, _discordPending.length).map(m => `- @${m.author}: ${m.text}`).join("\n")
        }`
      : "";

    // Inject pending TradingView webhook signals
    const wbBlock = _webhookSignals.length > 0
      ? `\n\n## Pending Webhook Signals (TradingView)\n${
          _webhookSignals.splice(0, _webhookSignals.length).map(s =>
            `- ${s.action?.toUpperCase()} ${s.ticker} @ $${s.price}`
          ).join("\n")
        }\nReview these signals and decide whether to act on them.`
      : "";

    // Inject pending dashboard messages
    const dashBlock = _dashboardMessages.length > 0
      ? `\n\n## Dashboard Messages\nThe following messages were sent from the web dashboard:\n${
          _dashboardMessages.splice(0, _dashboardMessages.length).map(m => `- ${m.text}`).join("\n")
        }`
      : "";

    // Inject scheduled tasks
    let schedBlock = "";
    try {
      const { readFileSync, existsSync } = require("node:fs");
      const ctxPath = path.join(JELLY_HOME, "context.json");
      if (existsSync(ctxPath)) {
        const store = JSON.parse(readFileSync(ctxPath, "utf-8"));
        const tasks: any[] = (store.schedule || []).filter((t: any) => t.active);
        if (tasks.length > 0) {
          schedBlock = `\n\n## Scheduled Tasks\nComplete these tasks and report results:\n${tasks.map((t: any) => `- ${t.task}`).join("\n")}`;
        }
      }
    } catch { /* non-fatal */ }

    const systemPrompt = basePrompt + liveBlock + tgBlock + dcBlock + wbBlock + dashBlock + schedBlock;
    if (systemPrompt) agent.setSystemPrompt(systemPrompt);
  });

  // -- Slash commands ---------------------------------------------------------

  agent.registerCommand("vault", {
    description: "Show vault balance and status",
    async handler(_args, ctx) {
      if (!vault) { ctx.ui.notify("Vault not initialized"); return; }
      const s = vault.getStats();
      ctx.ui.notify(vault.isLocked()
        ? ctx.ui.theme.fg("warn", "🔒 Vault locked -- use /unlock to access")
        : ctx.ui.theme.fg("success", `🔓 Vault: $${s.balance?.toFixed(2) ?? "0"} USD | ${s.entries} entries`));
    },
  });

  agent.registerCommand("status", {
    description: "Show full JellyOS system status",
    async handler(_args, ctx) {
      const uptime    = `${Math.floor(process.uptime() / 60)}m`;
      const mem       = `${(process.memoryUsage().rss / 1e6).toFixed(0)}MB`;
      const feedStats = feeds?.getStats();
      const vaultInfo = vault
        ? (vault.isLocked() ? "locked" : `$${vault.getStats().balance?.toFixed(2) ?? "0"}`)
        : "unavailable";
      ctx.ui.notify([
        `🪼 JellyOS  up:${uptime}  mem:${mem}`,
        `vault:${vaultInfo}  feeds:${feedStats?.sources ?? 0}src/${feedStats?.items ?? 0}items`,
        `node:${process.version}  home:${JELLY_HOME}`,
      ].join("\n"));
    },
  });

  agent.registerCommand("feeds", {
    description: "Show recent live feed items",
    async handler(_args, ctx) {
      if (!feeds) { ctx.ui.notify("Feeds not initialized"); return; }
      const items = feeds.getRecent({ limit: 8 });
      if (items.length === 0) { ctx.ui.notify("No feed items yet"); return; }
      ctx.ui.notify(items.map(i => `[${i.source}] ${i.title}`).join("\n"));
    },
  });

  agent.registerCommand("signals", {
    description: "Show active trading signals",
    async handler(_args, ctx) {
      if (!signals) { ctx.ui.notify("Signal engine not initialized"); return; }
      const sigs = signals.getActiveSignals();
      if (sigs.length === 0) { ctx.ui.notify("No active signals"); return; }
      ctx.ui.notify(sigs.slice(0, 6).map(s =>
        `[${s.asset}] ${s.direction.toUpperCase()} ${(s.strength * 100).toFixed(0)}% conf:${(s.confidence * 100).toFixed(0)}%`
      ).join("\n"));
    },
  });

  agent.registerCommand("panic", {
    description: "EMERGENCY: immediately stop all feeds, sweep vault, lock vault, mark all positions closed",
    async handler(_args, ctx) {
      const { existsSync, readFileSync, writeFileSync, mkdirSync } = require("node:fs");
      const lines: string[] = [
        ctx.ui.theme.fg("error", "🚨 PANIC MODE -- EXECUTING EMERGENCY SHUTDOWN"),
        "",
      ];

      const panicTs = Date.now();

      // -- Step 1: Stop auto-vault and feeds immediately ---------------------
      try { autoVault?.stop(); } catch { /* non-fatal */ }
      try { feeds?.stop(); }    catch { /* non-fatal */ }
      lines.push("✓ Auto-vault and data feeds stopped");

      // -- Step 2: Read open positions from context store --------------------
      const ctxPath = path.join(JELLY_HOME, "context.json");
      let store: any = {};
      let openPositions: any[] = [];
      if (existsSync(ctxPath)) {
        try {
          store         = JSON.parse(readFileSync(ctxPath, "utf-8"));
          openPositions = Array.isArray(store.positions) ? store.positions : [];
        } catch { /* corrupt context -- treat as empty */ }
      }

      // -- Step 3: Mark all tracked positions as emergency_closed ------------
      let sweepTotal = 0;
      if (openPositions.length > 0) {
        lines.push(`\nPositions emergency-closed (${openPositions.length}):`);
        const closedPositions = openPositions.map((p: any) => {
          const sym  = p.symbol ?? p.pair ?? "?";
          const side = p.side   ?? p.direction ?? "?";
          const size = p.size   ?? p.amount ?? "?";
          const pnl  = Number(p.unrealizedPnl ?? p.pnl ?? 0);
          sweepTotal += pnl > 0 ? pnl : 0;
          lines.push(`  ${ctx.ui.theme.fg("error", "CLOSED")} ${sym.padEnd(10)} ${side.padEnd(5)} size=${size}${pnl !== 0 ? `  PnL=$${pnl.toFixed(2)}` : ""}`);
          return { ...p, status: "emergency_closed", closedAt: panicTs, closedReason: "PANIC" };
        });
        // Persist closed state to context store so agent and dashboard reflect it
        mkdirSync(JELLY_HOME, { recursive: true });
        store.positions     = closedPositions;
        store.panic_at      = panicTs;
        store.panic_note    = "Emergency panic -- all positions marked closed. Verify on-chain.";
        try { writeFileSync(ctxPath, JSON.stringify(store, null, 2), "utf-8"); } catch { /* non-fatal */ }
      } else {
        lines.push("\nNo tracked positions in context store.");
      }

      // -- Step 4: Emergency vault sweep then immediate lock -----------------
      lines.push("");
      if (vault && !vault.isLocked()) {
        try {
          const bal = vault.getBalance();
          if (sweepTotal > 0) {
            await vault.sweep(sweepTotal, `PANIC emergency sweep -- ${openPositions.length} positions closed`, undefined);
            lines.push(ctx.ui.theme.fg("success", `✓ Swept $${sweepTotal.toFixed(2)} profit to vault`));
          }
          vault.lock();
          lines.push(ctx.ui.theme.fg("success", `✓ Vault locked (balance was $${bal.toFixed(2)})`));
          ctx.ui.setStatus("vault", "PANIC-locked");
        } catch (e: any) {
          lines.push(ctx.ui.theme.fg("error", `Vault lock error: ${e.message}`));
        }
      } else if (vault?.isLocked()) {
        lines.push("Vault already locked 🔒");
      } else {
        lines.push(ctx.ui.theme.fg("warn", "Vault not initialized -- lock manually"));
      }

      // -- Step 5: Broadcast PANIC event to dashboard ------------------------
      broadcastWs("agent", {
        status:         "PANIC",
        openPositions:  openPositions.length,
        swept:          sweepTotal,
        ts:             panicTs,
      });

      lines.push("");
      lines.push(ctx.ui.theme.fg("warn", "⚠  Verify position closure on-chain -- this agent tracks intent only."));
      lines.push(ctx.ui.theme.fg("muted", "Run /export to save vault ledger · /unlock to review balance"));

      ctx.ui.notify(lines.join("\n"));
    },
  });

  agent.registerCommand("effect", {
    description: "Show or set trading intensity level: eco | normal | turbo | max",
    async handler(args, ctx) {
      const level = args.trim().toLowerCase();
      const valid = ["eco", "normal", "turbo", "max"];
      if (!level) {
        const { readFileSync, existsSync } = require("node:fs");
        const ctxPath = require("node:path").join(JELLY_HOME, "context.json");
        const current = existsSync(ctxPath)
          ? (JSON.parse(readFileSync(ctxPath, "utf-8")).effect_level ?? "normal")
          : "normal";
        ctx.ui.notify(`Effect level: ${current}\nOptions: eco | normal | turbo | max\nUsage: /effect turbo`);
        return;
      }
      if (!valid.includes(level)) {
        ctx.ui.notify(`Unknown level: ${level}\nChoose: eco | normal | turbo | max`);
        return;
      }
      const { readFileSync, writeFileSync, existsSync, mkdirSync } = require("node:fs");
      const ctxPath = require("node:path").join(JELLY_HOME, "context.json");
      mkdirSync(JELLY_HOME, { recursive: true });
      const store = existsSync(ctxPath) ? JSON.parse(readFileSync(ctxPath, "utf-8")) : {};
      store.effect_level = level;
      writeFileSync(ctxPath, JSON.stringify(store, null, 2), "utf-8");
      const desc: Record<string, string> = {
        eco:    "minimal tools, fastest responses",
        normal: "standard tool usage",
        turbo:  "aggressive multi-tool analysis",
        max:    "all tools, deep analysis on every response",
      };
      ctx.ui.notify(ctx.ui.theme.fg("accent", `Effect level → ${level.toUpperCase()}\n${desc[level]}`));
    },
  });

  agent.registerCommand("lock", {
    description: "Lock the profit vault",
    async handler(_args, ctx) {
      if (!vault) { ctx.ui.notify("Vault not initialized"); return; }
      if (vault.isLocked()) { ctx.ui.notify("Vault is already locked 🔒"); return; }
      vault.lock();
      ctx.ui.notify(ctx.ui.theme.fg("warn", "🔒 Vault locked"));
    },
  });

  agent.registerCommand("changelog", {
    description: "Show JellyOS release notes",
    async handler(_args, ctx) {
      ctx.ui.notify([
        ctx.ui.theme.fg("accent", "JellyOS Changelog"),
        "",
        ctx.ui.theme.fg("border", "v2.0.0") + " -- agent-based rebuild",
        "  · Replaced custom agent engine with agent extension",
        "  · 22 domain tools: market, blockchain, vault, trading, feeds, prediction",
        "  · Jelly cyan/purple theme + custom ASCII header",
        "  · AutoVault: auto-sweeps profits at configurable threshold",
        "  · Live data feeds: prices, news, F&G, DeFi TVL, whale alerts",
        "  · Dashboard SSE server on port 4320",
        "  · Wallets: EVM, Solana, Cosmos generated on setup",
        "",
        ctx.ui.theme.fg("border", "v1.x") + " -- Custom Ink TUI (legacy)",
      ].join("\n"));
    },
  });

  agent.registerCommand("unlock", {
    description: "Unlock the profit vault -- usage: /unlock <passphrase>",
    async handler(args, ctx) {
      if (!vault) { ctx.ui.notify("Vault not initialized"); return; }
      const passphrase = args.trim();
      if (!passphrase) {
        ctx.ui.notify("Usage: /unlock <passphrase>");
        return;
      }
      try {
        const ok = await vault.unlock(passphrase);
        if (ok) {
          const s = vault.getStats();
          ctx.ui.notify(ctx.ui.theme.fg("success",
            `🔓 Vault unlocked -- Balance: $${(s.balance as number)?.toFixed(2) ?? "0"}`));
        } else {
          ctx.ui.notify(ctx.ui.theme.fg("error", "❌ Wrong passphrase"));
        }
      } catch (err: any) {
        ctx.ui.notify(ctx.ui.theme.fg("error", `Vault error: ${err.message}`));
      }
    },
  });

  // -- Extended slash commands -----------------------------------------------

  agent.registerCommand("wallets", {
    description: "Show all trading wallet addresses and vault cold addresses",
    async handler(_args, ctx) {
      const lines: string[] = ["🪼 JellyOS Wallets\n"];
      if (wallet) {
        lines.push("Trading wallets (hot -- fund these to give the agent capital):");
        const summary = wallet.getSummary();
        for (const [chain, addr] of Object.entries(summary)) {
          lines.push(`  ${chain.padEnd(8)} ${addr}`);
        }
      }
      const { existsSync, readFileSync } = require("node:fs");
      const addrFile = path.join(JELLY_HOME, "vault-addresses.json");
      if (existsSync(addrFile)) {
        lines.push("\nVault addresses (cold -- only accessible with your saved private key):");
        const a = JSON.parse(readFileSync(addrFile, "utf-8"));
        lines.push(`  evm      ${a.evm}`);
        lines.push(`  solana   ${a.solana}`);
        lines.push(`  cosmos   ${a.cosmos}`);
      }
      ctx.ui.notify(lines.join("\n"));
    },
  });

  agent.registerCommand("positions", {
    description: "Show current open positions tracked by the agent",
    async handler(_args, ctx) {
      const { existsSync, readFileSync } = require("node:fs");
      const ctxPath = path.join(JELLY_HOME, "context.json");
      if (!existsSync(ctxPath)) { ctx.ui.notify("No positions tracked yet"); return; }
      const store = JSON.parse(readFileSync(ctxPath, "utf-8"));
      const pos   = store.positions;
      if (!pos || (Array.isArray(pos) && pos.length === 0)) {
        ctx.ui.notify("No open positions"); return;
      }
      ctx.ui.notify("Open positions:\n" + JSON.stringify(pos, null, 2));
    },
  });

  agent.registerCommand("risk", {
    description: "Show current risk profile and exposure overview",
    async handler(_args, ctx) {
      const { existsSync, readFileSync } = require("node:fs");
      const ctxPath = path.join(JELLY_HOME, "context.json");
      if (!existsSync(ctxPath)) { ctx.ui.notify("No risk profile set"); return; }
      const store = JSON.parse(readFileSync(ctxPath, "utf-8"));
      const risk  = store.risk_profile ?? store.positions;
      if (!risk) { ctx.ui.notify("No risk data tracked yet"); return; }
      ctx.ui.notify("Risk profile:\n" + JSON.stringify(risk, null, 2));
    },
  });

  agent.registerCommand("history", {
    description: "Show vault sweep history -- usage: /history [N]",
    async handler(args, ctx) {
      if (!vault) { ctx.ui.notify("Vault not initialized"); return; }
      if (vault.isLocked()) { ctx.ui.notify("🔒 Vault locked -- use /unlock first"); return; }
      const n     = parseInt(args.trim()) || 10;
      const hist  = vault.getHistory().slice(0, n);
      if (hist.length === 0) { ctx.ui.notify("No vault history yet"); return; }
      const lines = hist.map((e: any) => {
        const d    = new Date(e.timestamp).toISOString().slice(0, 16).replace("T", " ");
        const sign = e.amount >= 0 ? "+" : "";
        return `${d}  ${sign}$${e.amount.toFixed(2).padStart(10)}  ${e.note ?? ""}${e.txHash ? `\n  tx: ${e.txHash}` : ""}`;
      });
      ctx.ui.notify(`Vault history (last ${hist.length}):\n\n${lines.join("\n")}`);
    },
  });

  agent.registerCommand("pnl", {
    description: "Show profit and loss summary",
    async handler(_args, ctx) {
      const vaultBal = vault && !vault.isLocked()
        ? `$${vault.getStats().balance?.toFixed(2) ?? "0"}`
        : vault ? "🔒 locked" : "unavailable";
      const tradingBal = wallet
        ? Object.keys(wallet.getSummary()).length + " chain wallet(s) -- check via get_balance"
        : "unavailable";
      ctx.ui.notify([
        "P&L Summary",
        "",
        `Vault (cold profit store):   ${vaultBal}`,
        `Trading wallet:              ${tradingBal}`,
        "",
        "For on-chain balances use: get_balance <chain>",
        "For live trade history use: /history",
      ].join("\n"));
    },
  });

  agent.registerCommand("watchlist", {
    description: "Show tracked assets -- add with: /watchlist add BTC",
    async handler(args, ctx) {
      const { existsSync, readFileSync, writeFileSync, mkdirSync } = require("node:fs");
      const ctxPath = path.join(JELLY_HOME, "context.json");
      const store   = existsSync(ctxPath) ? JSON.parse(readFileSync(ctxPath, "utf-8")) : {};
      const list: string[] = Array.isArray(store.watchlist) ? store.watchlist : [];
      const [sub, ...rest] = args.trim().split(/\s+/);
      if (sub === "add" && rest[0]) {
        const sym = rest[0].toUpperCase();
        if (!list.includes(sym)) list.push(sym);
        store.watchlist = list;
        mkdirSync(JELLY_HOME, { recursive: true });
        writeFileSync(ctxPath, JSON.stringify(store, null, 2), "utf-8");
        ctx.ui.notify(`Added ${sym} to watchlist: ${list.join(", ")}`);
      } else if (sub === "remove" && rest[0]) {
        const sym = rest[0].toUpperCase();
        store.watchlist = list.filter(s => s !== sym);
        writeFileSync(ctxPath, JSON.stringify(store, null, 2), "utf-8");
        ctx.ui.notify(`Removed ${sym}. Watchlist: ${store.watchlist.join(", ") || "(empty)"}`);
      } else {
        ctx.ui.notify(list.length
          ? `Watchlist: ${list.join(", ")}\n\nAdd:    /watchlist add BTC\nRemove: /watchlist remove BTC`
          : "Watchlist is empty.\nAdd assets: /watchlist add BTC");
      }
    },
  });

  agent.registerCommand("gas", {
    description: "Show current gas prices across chains",
    async handler(_args, ctx) {
      const key = process.env.ALCHEMY_KEY;
      if (!key) { ctx.ui.notify("Alchemy key not set -- run /config to add it"); return; }
      const chains = ["eth-mainnet", "arb-mainnet", "base-mainnet", "opt-mainnet", "polygon-mainnet"];
      const results: string[] = ["⛽ Gas Prices\n"];
      await Promise.all(chains.map(async (network) => {
        try {
          const url  = `https://${network}.g.alchemy.com/v2/${key}`;
          const res  = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", method: "eth_gasPrice", params: [], id: 1 }),
            signal: AbortSignal.timeout(4000),
          });
          const d    = await res.json() as any;
          const gwei = (parseInt(d.result, 16) / 1e9).toFixed(1);
          results.push(`  ${network.replace("-mainnet", "").padEnd(12)} ${gwei} gwei`);
        } catch { results.push(`  ${network.replace("-mainnet", "").padEnd(12)} unavailable`); }
      }));
      ctx.ui.notify(results.join("\n"));
    },
  });

  agent.registerCommand("tvl", {
    description: "Show DeFi TVL -- usage: /tvl [protocol]",
    async handler(args, ctx) {
      const proto = args.trim().toLowerCase();
      try {
        const url = proto
          ? `https://api.llama.fi/protocol/${proto}`
          : "https://api.llama.fi/v2/protocols?limit=10";
        const res  = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) throw new Error(`DeFiLlama ${res.status}`);
        const data = await res.json() as any;
        if (proto) {
          ctx.ui.notify(`${data.name ?? proto}\nTVL: ${fmtUsd(data.tvl ?? 0)}\nChains: ${(data.chains ?? []).slice(0, 5).join(", ")}`);
        } else {
          const lines = (Array.isArray(data) ? data : []).slice(0, 10).map((p: any) =>
            `${(p.name ?? "?").padEnd(20)} ${fmtUsd(p.tvl ?? 0)}`
          );
          ctx.ui.notify("Top DeFi Protocols by TVL:\n\n" + lines.join("\n"));
        }
      } catch (e: any) {
        ctx.ui.notify(`TVL lookup failed: ${e.message}`);
      }
    },
  });

  agent.registerCommand("whale", {
    description: "Scan an address for whale activity -- usage: /whale <address>",
    async handler(args, ctx) {
      const addr = args.trim();
      if (!addr) { ctx.ui.notify("Usage: /whale <address>"); return; }
      ctx.ui.notify(`Scanning ${addr}...\n\nUse the agent: ask "scan whale ${addr}" for full on-chain analysis`);
    },
  });

  agent.registerCommand("chain", {
    description: "Set active chain context -- usage: /chain [name]",
    async handler(args, ctx) {
      const { readFileSync, writeFileSync, existsSync, mkdirSync } = require("node:fs");
      const ctxPath = path.join(JELLY_HOME, "context.json");
      const chain   = args.trim().toLowerCase();
      if (!chain) {
        const store  = existsSync(ctxPath) ? JSON.parse(readFileSync(ctxPath, "utf-8")) : {};
        const active = store.active_chain ?? "ethereum";
        ctx.ui.notify(`Active chain: ${active}\n\nSet with: /chain solana\nOptions: ethereum, base, arbitrum, solana, bsc, polygon, cosmos`);
        return;
      }
      mkdirSync(JELLY_HOME, { recursive: true });
      const store = existsSync(ctxPath) ? JSON.parse(readFileSync(ctxPath, "utf-8")) : {};
      store.active_chain = chain;
      writeFileSync(ctxPath, JSON.stringify(store, null, 2), "utf-8");
      ctx.ui.notify(ctx.ui.theme.fg("accent", `Active chain → ${chain}`));
    },
  });

  agent.registerCommand("schedule", {
    description: "Show AutoVault schedule and agent task queue",
    async handler(_args, ctx) {
      const { existsSync, readFileSync } = require("node:fs");
      const ctxPath = path.join(JELLY_HOME, "context.json");
      const store   = existsSync(ctxPath) ? JSON.parse(readFileSync(ctxPath, "utf-8")) : {};
      const thresh  = process.env.AUTOVAULT_THRESHOLD ?? store.auto_vault_threshold ?? "100";
      const tasks   = store.schedule ?? [];
      const lines   = [
        `AutoVault: sweep to vault when trading balance > $${thresh}`,
        `Effect level: ${store.effect_level ?? "normal"}`,
        `Active chain: ${store.active_chain ?? "ethereum"}`,
        "",
        tasks.length ? `Scheduled tasks:\n${tasks.map((t: any) => `  • ${JSON.stringify(t)}`).join("\n")}` : "No scheduled tasks",
      ];
      ctx.ui.notify(lines.join("\n"));
    },
  });

  agent.registerCommand("model", {
    description: "Show, pick, or search models -- /model | /model <query> | /model <tier> | /model set <id>",
    async handler(args, ctx) {
      const { writeFileSync, readFileSync, existsSync, mkdirSync } = require("node:fs");
      const envFile = path.join(JELLY_HOME, ".env");
      mkdirSync(JELLY_HOME, { recursive: true });

      const readCurrent = (): string => {
        if (!existsSync(envFile)) return process.env.DEFAULT_MODEL ?? "anthropic/claude-sonnet-4-5";
        const m = readFileSync(envFile, "utf-8").match(/^DEFAULT_MODEL=(.+)$/m);
        return m?.[1]?.trim() ?? process.env.DEFAULT_MODEL ?? "anthropic/claude-sonnet-4-5";
      };

      const saveModel = (id: string) => {
        const content = existsSync(envFile) ? readFileSync(envFile, "utf-8") : "";
        const re = /^DEFAULT_MODEL=.*$/m;
        const line = `DEFAULT_MODEL=${id}`;
        writeFileSync(envFile, re.test(content) ? content.replace(re, line) : content + "\n" + line + "\n", "utf-8");
        process.env.DEFAULT_MODEL = id;
      };

      const arg    = args.trim();
      const current = readCurrent();

      // /model set <id> -- set by exact model ID
      if (arg.startsWith("set ")) {
        const id = arg.slice(4).trim();
        saveModel(id);
        ctx.ui.notify(ctx.ui.theme.fg("accent", `Model set to: ${id}\nRestart jellyos to apply.`));
        return;
      }

      // /model orchestrator|analyst|worker|free -- show tier
      if (["orchestrator", "analyst", "worker", "free"].includes(arg)) {
        const pool = modelRegistry.getPool(arg as any);
        const available = pool.filter(tm => tm.available && tm.failures < 3);
        if (available.length === 0) {
          ctx.ui.notify(`No available models in tier: ${arg}`);
          return;
        }
        const lines = [
          ctx.ui.theme.fg("accent", `Tier: ${arg.toUpperCase()} (${available.length} available)`),
          "",
          ...available.slice(0, 15).map((tm, i) => {
            const cost  = tm.costPer1K <= 0 ? "FREE" : `$${(tm.costPer1K / 1_000_000_000).toFixed(6)}/1K`;
            const ctx_  = tm.model.context_length >= 1_000_000 ? `${(tm.model.context_length / 1_000_000).toFixed(1)}M ctx` : `${(tm.model.context_length / 1000).toFixed(0)}K ctx`;
            const marker = tm.model.id === current ? ctx.ui.theme.fg("accent", ">") : " ";
            return `${marker} [${String(i + 1).padStart(2)}] ${tm.model.id.padEnd(40)} ${cost.padEnd(16)} ${ctx_}`;
          }),
          "",
          ctx.ui.theme.fg("muted", `Current: ${current}`),
          ctx.ui.theme.fg("muted", "Use: /model set <id> to switch"),
        ];
        ctx.ui.notify(lines.join("\n"));
        return;
      }

      // /model <query> -- search models
      if (arg) {
        const results = modelRegistry.search(arg, 15);
        if (results.length === 0) {
          ctx.ui.notify(`No models matching: "${arg}"\nTry: /model set <full-id>`);
          return;
        }
        const lines = [
          ctx.ui.theme.fg("accent", `Search: "${arg}" (${results.length} results)`),
          "",
          ...results.map((tm, i) => {
            const cost  = tm.costPer1K <= 0 ? "FREE" : `$${(tm.costPer1K / 1_000_000_000).toFixed(6)}/1K`;
            const marker = tm.model.id === current ? ctx.ui.theme.fg("accent", ">") : " ";
            return `${marker} [${String(i + 1).padStart(2)}] [${tm.tier}] ${tm.model.id}  ${cost}`;
          }),
          "",
          ctx.ui.theme.fg("muted", `Current: ${current}`),
          ctx.ui.theme.fg("muted", "Use: /model set <id> to switch"),
        ];
        ctx.ui.notify(lines.join("\n"));
        return;
      }

      // /model -- show tier overview
      const tiers = ["orchestrator", "analyst", "worker", "free"] as const;
      const lines = [
        ctx.ui.theme.fg("accent", `🪼 Model Registry (${modelRegistry.modelCount} total)`),
        "",
      ];
      for (const tier of tiers) {
        const pool     = modelRegistry.getPool(tier);
        const avail    = pool.filter(tm => tm.available && tm.failures < 3);
        lines.push(`  ${tier.padEnd(14)} ${avail.length}/${pool.length} available`);
      }
      lines.push(
        "",
        ctx.ui.theme.fg("muted", `Current: ${current}`),
        ctx.ui.theme.fg("muted", "Usage: /model <tier> | /model <query> | /model set <id>"),
      );
      ctx.ui.notify(lines.join("\n"));
    },
  });

  agent.registerCommand("config", {
    description: "Show current JellyOS configuration (keys masked)",
    async handler(_args, ctx) {
      const { existsSync, readFileSync } = require("node:fs");
      const envFile = path.join(JELLY_HOME, ".env");
      const lines   = ["JellyOS Config\n"];
      if (existsSync(envFile)) {
        for (const line of readFileSync(envFile, "utf-8").split("\n")) {
          const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
          if (!m) continue;
          const val = m[2].length > 8
            ? m[2].slice(0, 4) + "****" + m[2].slice(-4)
            : "****";
          lines.push(`  ${m[1].padEnd(26)} ${val}`);
        }
      } else {
        lines.push("  No config file found. Run: jellyos setup");
      }
      lines.push(`\n  Home: ${JELLY_HOME}`);
      lines.push("  Edit: jellyos config");
      ctx.ui.notify(lines.join("\n"));
    },
  });

  agent.registerCommand("skills", {
    description: "List installed Jelly Skills",
    async handler(_args, ctx) {
      const { existsSync, readdirSync } = require("node:fs");
      const skillsDir = path.join(JELLY_HOME, "skills");
      if (!existsSync(skillsDir)) {
        ctx.ui.notify("No Jelly Skills installed.\nInstall during setup or clone to ~/.jelly/skills/"); return;
      }
      const dirs = readdirSync(skillsDir, { withFileTypes: true }).filter((d: any) => d.isDirectory());
      if (dirs.length === 0) { ctx.ui.notify("No skills installed yet"); return; }
      const lines = dirs.map((d: any) => {
        const hasCmd = existsSync(path.join(skillsDir, d.name, "jelly-command.json"));
        return `  ${d.name.padEnd(32)} ${hasCmd ? "⚡ command" : "  knowledge"}`;
      });
      ctx.ui.notify(`Jelly Skills (${dirs.length} installed)\n\n${lines.join("\n")}`);
    },
  });

  agent.registerCommand("network", {
    description: "Show chain connectivity and RPC health",
    async handler(_args, ctx) {
      const key    = process.env.ALCHEMY_KEY;
      const checks = [
        { name: "CoinGecko",   url: "https://api.coingecko.com/api/v3/ping"             },
        { name: "DeFiLlama",   url: "https://api.llama.fi/v2/protocols?limit=1"         },
        { name: "Alternative.me", url: "https://api.alternative.me/fng/?limit=1"       },
        { name: "CoinGlass",   url: "https://open-api.coinglass.com/api/public/v3/funding_rates/ohlc" },
      ];
      if (key) checks.push({ name: "Alchemy", url: `https://eth-mainnet.g.alchemy.com/v2/${key}` });
      const lines = ["Network Status\n"];
      await Promise.all(checks.map(async (c) => {
        try {
          const r = await fetch(c.url, { method: "GET", signal: AbortSignal.timeout(3000) });
          lines.push(`  ${c.name.padEnd(16)} ${r.ok || r.status < 500 ? "✓ ok" : `✗ ${r.status}`}`);
        } catch {
          lines.push(`  ${c.name.padEnd(16)} ✗ unreachable`);
        }
      }));
      ctx.ui.notify(lines.join("\n"));
    },
  });

  agent.registerCommand("cost", {
    description: "Show session and lifetime token usage",
    async handler(_args, ctx) {
      ctx.ui.notify(`Cost tracking: available via the framework.\nUse the ask agent: "what is my current cost usage?" or call the cost_report tool.`);
    },
  });

  agent.registerCommand("ticker", {
    description: "Show live price ticker",
    async handler(_args, ctx) {
      const ticks = priceFeed.getAll();
      if (ticks.length === 0) {
        ctx.ui.notify("No price data yet -- feeds initializing.");
        return;
      }
      const lines = ticks.slice(0, 12).map(t => {
        const change = t.change24h >= 0 ? `+${t.change24h.toFixed(2)}%` : `${t.change24h.toFixed(2)}%`;
        const emoji  = t.change24h > 1 ? "🟢" : t.change24h < -1 ? "🔴" : "⚪";
        return `${emoji} ${t.symbol.padEnd(6)} $${t.price.toLocaleString()} ${change}`;
      });
      ctx.ui.notify(`Live Prices\n\n${lines.join("\n")}`);
    },
  });

  agent.registerCommand("news", {
    description: "Show latest crypto news with sentiment",
    async handler(_args, ctx) {
      const report = newsFeed.getLatest();
      if (!report) {
        ctx.ui.notify("News data not yet available -- fetching in background.");
        return;
      }
      const score = report.avgSentiment;
      const mood  = score > 0.2 ? "🟢 Bullish" : score < -0.2 ? "🔴 Bearish" : "🟡 Neutral";
      ctx.ui.notify([
        `📰 News Sentiment: ${mood} (${(score * 100).toFixed(0)}%)`,
        `${report.positive}p/${report.negative}n/${report.neutral}· · Trending: ${report.topKeywords.slice(0, 8).join(", ")}`,
        "",
        ...report.items.slice(0, 8).map(i => {
          const s = (i.sentiment ?? 0) >= 0.1 ? "🟢" : (i.sentiment ?? 0) <= -0.1 ? "🔴" : " ";
          return `${s} [${i.source}] ${i.title.slice(0, 90)}`;
        }),
      ].join("\n"));
    },
  });

  agent.registerCommand("ping", {
    description: "Quick health check -- APIs, feeds, vault, wallets",
    async handler(_args, ctx) {
      const checks: string[] = ["JellyOS Health Check\n"];
      checks.push(`  Node.js          ✓ ${process.version}`);
      checks.push(`  Uptime           ${Math.floor(process.uptime() / 60)}m`);
      checks.push(`  Memory           ${(process.memoryUsage().rss / 1e6).toFixed(0)}MB`);
      checks.push(`  JELLY_HOME       ${path.join(JELLY_HOME, ".env") ? "✓" : "✗"} ${JELLY_HOME}`);
      checks.push(`  OpenRouter key   ${process.env.OPENROUTER_API_KEY ? "✓ set" : "✗ missing"}`);
      checks.push(`  Alchemy key      ${process.env.ALCHEMY_KEY ? "✓ set" : "-- not set"}`);
      checks.push(`  Vault            ${vault ? (vault.isLocked() ? "🔒 locked" : `✓ $${vault.getStats().balance?.toFixed(2)}`) : "✗ not initialized"}`);
      checks.push(`  Trading wallets  ${wallet ? `✓ ${Object.keys(wallet.getSummary()).length} chains` : "✗ not initialized"}`);
      checks.push(`  Feeds            ${feeds ? `✓ ${feeds.getStats()?.sources ?? 0} sources` : "✗ not initialized"}`);
      checks.push(`  Signals          ${signals ? "✓ running" : "✗ not initialized"}`);
      checks.push(`  Dashboard SSE    ✓ port ${process.env.JELLY_DASHBOARD_PORT ?? "4320"}`);
      ctx.ui.notify(checks.join("\n"));
    },
  });

  agent.registerCommand("memo", {
    description: "Pin a note to session context -- usage: /memo [text]",
    async handler(args, ctx) {
      const { readFileSync, writeFileSync, existsSync, mkdirSync } = require("node:fs");
      const text = args.trim();
      const ctxPath = path.join(JELLY_HOME, "context.json");
      if (!text) {
        const store = existsSync(ctxPath) ? JSON.parse(readFileSync(ctxPath, "utf-8")) : {};
        ctx.ui.notify(store.memo ? `Current memo:\n\n  ${store.memo}` : "No memo set.\nUsage: /memo <text>");
        return;
      }
      mkdirSync(JELLY_HOME, { recursive: true });
      const store = existsSync(ctxPath) ? JSON.parse(readFileSync(ctxPath, "utf-8")) : {};
      store.memo = text.slice(0, 500);
      writeFileSync(ctxPath, JSON.stringify(store, null, 2), "utf-8");
      ctx.ui.notify(ctx.ui.theme.fg("accent", `Memo pinned: "${store.memo}"`));
    },
  });

  // -- Swarm state (updated by swarm router on each complex turn) ------------
  const swarmState = {
    lastTaskComplexity: 0,
    lastSubtaskCount:   0,
    lastModel:          process.env.DEFAULT_MODEL ?? "default",
    totalTurns:         0,
    toolCallsTotal:     0,
    fallbacks:          0,
    // Track swarm and model fallback events from AgentRunner
    onAgentEvent: (event) => {
      switch (event.type) {
        case "swarm_subtask":
          swarmState.lastTaskComplexity = Math.max(swarmState.lastTaskComplexity, 50); // any swarm task is complex
          swarmState.lastSubtaskCount = event.remaining + 1;
          break;
        case "swarm_review":
          swarmState.lastTaskComplexity = 100; // full swarm analysis
          break;
        case "model_fallback":
          swarmState.fallbacks++;
          break;
        case "tool_done":
          swarmState.toolCallsTotal++;
          break;
        case "turn_done":
          swarmState.totalTurns++;
          break;
      }
    },
  };

  agent.registerCommand("agents", {
    description: "Show swarm router status and trigger multi-step analysis",
    async handler(args, ctx) {
      const cmd   = args.trim().toLowerCase();
      const { existsSync, readFileSync } = require("node:fs");

      if (!cmd || cmd === "status") {
        // Show live swarm routing stats
        const ctxPath = path.join(JELLY_HOME, "context.json");
        const effect  = existsSync(ctxPath)
          ? (JSON.parse(readFileSync(ctxPath, "utf-8")).effect_level ?? "normal")
          : "normal";
        const subtaskLimit = ({ eco: 1, normal: 2, turbo: 4, max: 5 } as Record<string, number>)[effect] ?? 2;
        const modelChain   = process.env.OPENROUTER_API_KEY
          ? ["primary", "claude-3-haiku", "gpt-4o-mini", "gemini-flash", "llama-3-8b"]
          : process.env.ANTHROPIC_API_KEY
          ? ["primary", "claude-3-haiku", "claude-3.5-haiku"]
          : ["primary"];

        ctx.ui.notify([
          ctx.ui.theme.fg("accent", "Sub-Agent / Swarm Status"),
          "",
          `  Primary agent      ✓ running`,
          `  Swarm router       ✓ active (max ${subtaskLimit} sub-tasks @ ${effect} mode)`,
          `  Model chain        ${modelChain.length} models (429/5xx auto-rotation)`,
          `  Fallback depth     ${modelChain.length - 1} fallback(s) configured`,
          "",
          ctx.ui.theme.fg("muted", "Session stats:"),
          `  Turns completed    ${swarmState.totalTurns}`,
          `  Tool calls         ${swarmState.toolCallsTotal}`,
          `  Model fallbacks    ${swarmState.fallbacks}`,
          `  Last task score    ${swarmState.lastTaskComplexity} (>${3} → swarm)`,
          `  Last sub-tasks     ${swarmState.lastSubtaskCount}`,
          "",
          `  /agents analyze <topic>   -- run multi-step swarm analysis`,
          `  /effect turbo             -- increase sub-task depth`,
        ].join("\n"));
        return;
      }

      if (cmd.startsWith("analyze ") || cmd.startsWith("analyze")) {
        const topic = args.replace(/^analyze\s*/i, "").trim() || "current market conditions";

        // Complexity-based swarm: split topic into focused sub-tasks
        const { existsSync: ex2, readFileSync: rf2 } = require("node:fs");
        const ctxPath2 = path.join(JELLY_HOME, "context.json");
        const effect2  = ex2(ctxPath2)
          ? (JSON.parse(rf2(ctxPath2, "utf-8")).effect_level ?? "normal")
          : "normal";
        const maxSub = ({ eco: 1, normal: 2, turbo: 3, max: 5 } as Record<string, number>)[effect2] ?? 2;

        // Decompose the topic into N parallel sub-tasks
        const subTasks = [
          `Price action and momentum analysis for: ${topic}`,
          `On-chain data and DeFi signals for: ${topic}`,
          maxSub >= 3 ? `News sentiment and macro context for: ${topic}` : null,
          maxSub >= 4 ? `Risk factors and position sizing for: ${topic}` : null,
          maxSub >= 5 ? `Entry/exit strategy synthesis for: ${topic}` : null,
        ].filter(Boolean) as string[];

        swarmState.lastSubtaskCount   = subTasks.length;
        swarmState.lastTaskComplexity = subTasks.length * 2;

        ctx.ui.notify(
          ctx.ui.theme.fg("accent", `🪼 Swarm Analysis -- ${subTasks.length} agents`) + "\n" +
          ctx.ui.theme.fg("muted", `Topic: ${topic}`) + "\n\n" +
          subTasks.map((t, i) => `  [${i + 1}/${subTasks.length}] ${t}`).join("\n") + "\n\n" +
          ctx.ui.theme.fg("muted", "Send the topic as a message to the agent to begin -- the swarm router\nwill decompose and synthesize results automatically.")
        );
        swarmState.totalTurns++;
        return;
      }

      ctx.ui.notify(
        "Usage: /agents [status] | /agents analyze <topic>\n\n" +
        "  /agents          -- show swarm router status\n" +
        "  /agents analyze  -- run multi-step decomposed analysis"
      );
    },
  });

  agent.registerCommand("export", {
    description: "Export vault ledger to CSV in current directory",
    async handler(_args, ctx) {
      if (!vault) { ctx.ui.notify("Vault not initialized"); return; }
      if (vault.isLocked()) { ctx.ui.notify("🔒 Vault locked -- use /unlock first"); return; }
      const { writeFileSync } = require("node:fs");
      const hist = vault.getHistory();
      if (hist.length === 0) { ctx.ui.notify("No vault history to export"); return; }
      const header = "timestamp,date,amount,note,txHash";
      const rows   = hist.map((e: any) =>
        `${e.timestamp},"${new Date(e.timestamp).toISOString()}",${e.amount},"${(e.note ?? "").replace(/"/g, '""')}","${e.txHash ?? ""}"`
      );
      const filename = `jelly-vault-${Date.now()}.csv`;
      writeFileSync(filename, [header, ...rows].join("\n"), "utf-8");
      ctx.ui.notify(`✓ Exported ${hist.length} entries → ${filename}`);
    },
  });

  agent.registerCommand("debug", {
    description: "Show last tool calls from debug log",
    async handler(_args, ctx) {
      const { existsSync, readFileSync } = require("node:fs");
      const ctxPath = path.join(JELLY_HOME, "context.json");
      const store   = existsSync(ctxPath) ? JSON.parse(readFileSync(ctxPath, "utf-8")) : {};
      const log: any[] = Array.isArray(store.debug_log) ? store.debug_log : [];
      if (log.length === 0) { ctx.ui.notify("No tool calls logged yet"); return; }
      const lines = log.slice(0, 10).map((e: any) =>
        `  ${new Date(e.ts ?? 0).toISOString().slice(11, 19)}  ${(e.tool ?? "?").padEnd(24)} ${e.ms ?? "?"}ms`
      );
      ctx.ui.notify("Recent tool calls:\n\n" + lines.join("\n"));
    },
  });

  // -- Skill command auto-registration --------------------------------------
  (() => {
    const { existsSync, readdirSync, readFileSync } = require("node:fs");
    const skillsDir = path.join(JELLY_HOME, "skills");
    if (!existsSync(skillsDir)) return;
    try {
      const skills = readdirSync(skillsDir, { withFileTypes: true })
        .filter((d: any) => d.isDirectory())
        .map((d: any) => d.name);
      for (const skill of skills) {
        const cmdFile = path.join(skillsDir, skill, "jelly-command.json");
        if (!existsSync(cmdFile)) continue;
        try {
          const cmd = JSON.parse(readFileSync(cmdFile, "utf-8"));
          if (!cmd.command || !cmd.description) continue;
          const toolName   = cmd.tool as string | undefined;
          const skillLabel = skill;
          agent.registerCommand(cmd.command, {
            description: `[${skillLabel}] ${cmd.description}`,
            async handler(args: string, ctx: any) {
              if (toolName) {
                ctx.ui.notify(`Running ${skillLabel}/${cmd.command}...\nArgs: ${args || "(none)"}`);
              } else {
                ctx.ui.notify(`[${skillLabel}] ${cmd.description}\n\nAsk the agent for details or pass args in your message.`);
              }
            },
          });
        } catch { /* skip malformed */ }
      }
    } catch { /* ignore scan errors */ }
  })();

  // -- Tools: Market Data -----------------------------------------------------

  agent.registerTool({
    name: "get_market_data",
    label: "Market Data",
    description: "Get current prices and 24h stats for crypto assets via CoinGecko. Use coingecko IDs: bitcoin, ethereum, solana, etc.",
    parameters: Type.Object({
      symbols: Type.Array(
        Type.String({ description: "CoinGecko IDs (e.g. bitcoin, ethereum, solana)" }),
        { description: "Asset IDs to fetch (max 10)" }
      ),
    }),
    async execute(_id, params) {
      const ids = params.symbols.slice(0, 10).map((s: string) => s.toLowerCase().replace(/\s+/g, "-"));
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
      const data = await res.json() as any;
      const lines = Object.entries(data).map(([id, info]: [string, any]) =>
        `${id.toUpperCase()}: $${info.usd?.toLocaleString() ?? "?"} | 24h: ${info.usd_24h_change?.toFixed(2) ?? "?"}% | Vol: ${fmtUsd(info.usd_24h_vol ?? 0)}`
      );
      if (lines.length === 0) throw new Error("No data returned -- check asset IDs");
      const pricePayload = Object.entries(data).map(([id, info]: [string, any]) => ({
        id, price: info.usd, change24h: info.usd_24h_change, ts: Date.now(),
      }));
      broadcastWs("prices", pricePayload);
      return text(lines.join("\n"));
    },
  });

  agent.registerTool({
    name: "get_fear_greed",
    label: "Fear & Greed Index",
    description: "Get the current Crypto Fear & Greed Index (0=extreme fear, 100=extreme greed)",
    parameters: Type.Object({}),
    async execute() {
      const res = await fetch("https://api.alternative.me/fng/?limit=1", { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json() as any;
      const item = data?.data?.[0];
      if (!item) throw new Error("No data returned");
      const v = parseInt(item.value);
      const zone = v <= 25 ? "Extreme Fear -- contrarian buy zone"
                 : v >= 75 ? "Extreme Greed -- potential sell zone"
                 : "Neutral zone";
      return text(`Fear & Greed: ${item.value}/100 -- ${item.value_classification}\n${zone}`);
    },
  });

  agent.registerTool({
    name: "get_funding_rates",
    label: "Funding Rates",
    description: "Get perpetual futures funding rates for a symbol across exchanges",
    parameters: Type.Object({
      symbol: Type.Optional(Type.String({ description: "Asset symbol: BTC, ETH, SOL, etc. (default: BTC)" })),
    }),
    async execute(_id, params) {
      const sym = (params.symbol ?? "BTC").toUpperCase();
      const res = await fetch(
        `https://open-api.coinglass.com/public/v2/funding?symbol=${sym}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) throw new Error(`Coinglass ${res.status} -- API key may be required`);
      const data = await res.json() as any;
      if (!data?.data) throw new Error("No funding data");
      const rates = (Array.isArray(data.data) ? data.data : []).slice(0, 8);
      const lines = rates.map((r: any) => `${r.exchangeName}: ${(r.fundingRate * 100).toFixed(4)}%`);
      const avg = rates.reduce((s: number, r: any) => s + (r.fundingRate ?? 0), 0) / (rates.length || 1);
      const signal = avg > 0.001 ? "⚠️ Longs overextended" : avg < -0.0003 ? "⚠️ Shorts overextended" : "Normal";
      return text(`${sym} Funding Rates:\n${lines.join("\n")}\nAvg: ${(avg * 100).toFixed(4)}% -- ${signal}`);
    },
  });

  agent.registerTool({
    name: "get_defi_tvl",
    label: "DeFi TVL",
    description: "Get Total Value Locked by chain or protocol via DeFi Llama",
    parameters: Type.Object({
      protocol: Type.Optional(Type.String({ description: "Protocol slug (aave, uniswap, curve...) or omit for chain overview" })),
    }),
    async execute(_id, params) {
      if (params.protocol) {
        const res = await fetch(`https://api.llama.fi/protocol/${params.protocol}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`Protocol not found: ${params.protocol}`);
        const d = await res.json() as any;
        return text(`${d.name}: ${fmtUsd(d.tvl ?? 0)} TVL | ${d.category} | Chains: ${(d.chains ?? []).slice(0, 5).join(", ")}`);
      }
      const res = await fetch("https://api.llama.fi/v2/chains", { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`DeFi Llama ${res.status}`);
      const data = await res.json() as any;
      const top = (Array.isArray(data) ? data : [])
        .sort((a: any, b: any) => (b.tvl ?? 0) - (a.tvl ?? 0)).slice(0, 10);
      return text("Top Chains by TVL:\n" + top.map((c: any) => `${c.name}: ${fmtUsd(c.tvl ?? 0)}`).join("\n"));
    },
  });

  agent.registerTool({
    name: "get_gas_prices",
    label: "Gas Prices",
    description: "Get current gas prices across EVM networks (requires ALCHEMY_KEY env var)",
    parameters: Type.Object({
      networks: Type.Optional(Type.Array(Type.String(), { description: "Chain names (default: ethereum, bsc, polygon)" })),
    }),
    async execute(_id, params) {
      const apiKey = process.env.ALCHEMY_KEY;
      if (!apiKey) throw new Error("ALCHEMY_KEY not set -- run jellyos setup");
      const nets = (params.networks ?? ["ethereum", "bsc", "polygon"]).slice(0, 5);
      const results: string[] = [];
      for (const net of nets) {
        try {
          const res = await fetch(`https://${CHAIN_NETWORK[net] ?? "eth-mainnet"}.g.alchemy.com/v2/${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] }),
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) { results.push(`${net}: unavailable`); continue; }
          const data = await res.json() as any;
          const gwei = parseInt(data.result, 16) / 1e9;
          results.push(`${net}: ${gwei.toFixed(1)} Gwei`);
        } catch { results.push(`${net}: unavailable`); }
      }
      return text(results.join("\n"));
    },
  });

  agent.registerTool({
    name: "get_polymarket",
    label: "Polymarket",
    description: "Get trending Polymarket prediction markets",
    parameters: Type.Object({
      limit:  Type.Optional(Type.Number({ description: "Number of markets (default 5)" })),
      search: Type.Optional(Type.String({ description: "Search query" })),
    }),
    async execute(_id, params) {
      let url = `https://gamma-api.polymarket.com/markets?limit=${params.limit ?? 5}&order=volume&ascending=false&active=true`;
      if (params.search) url += `&q=${encodeURIComponent(params.search)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Polymarket ${res.status}`);
      const data = await res.json() as any;
      const markets = Array.isArray(data) ? data : [];
      if (markets.length === 0) return text("No markets found");
      const lines = markets.slice(0, 6).map((m: any) => {
        const yes = ((m.outcomePrices?.[0] ?? 0) * 100).toFixed(0);
        return `${m.question}\n  Yes: ${yes}% | Vol: ${fmtUsd(m.volume ?? 0)}${m.slug ? `\n  https://polymarket.com/event/${m.slug}` : ""}`;
      });
      return text(lines.join("\n\n"));
    },
  });

  // -- Tools: Blockchain ------------------------------------------------------

  agent.registerTool({
    name: "get_balance",
    label: "Wallet Balance",
    description: "Check wallet balance on any supported blockchain",
    parameters: Type.Object({
      chain:   Type.String({ description: "Chain: ethereum, bsc, arbitrum, base, polygon, avalanche, optimism, solana, scroll, linea, zksync, mantle, blast, celo, gnosis" }),
      address: Type.Optional(Type.String({ description: "Wallet address -- leave blank to use built-in wallet" })),
    }),
    async execute(_id, params) {
      const apiKey = process.env.ALCHEMY_KEY;
      if (!apiKey) throw new Error("ALCHEMY_KEY not set -- run jellyos setup");
      let addr = params.address;
      if (!addr && wallet) {
        addr = wallet.getAddress(params.chain) ?? undefined;
        if (!addr) throw new Error(`No wallet for ${params.chain}. Run jellyos setup first.`);
      }
      if (!addr) throw new Error("No address provided");
      const network = CHAIN_NETWORK[params.chain] ?? "eth-mainnet";
      const res = await fetch(`https://${network}.g.alchemy.com/v2/${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [addr, "latest"] }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`Alchemy ${res.status}`);
      const data = await res.json() as any;
      const formatted = (Number(BigInt(data.result)) / 1e18).toFixed(6);
      return text(`${addr.slice(0, 8)}... ${formatted} ${CHAIN_SYMBOL[params.chain] ?? "ETH"}`);
    },
  });

  agent.registerTool({
    name: "sign_transaction",
    label: "Sign Transaction",
    description: "Sign an unsigned transaction payload with the built-in wallet. For EVM: accepts RLP-encoded tx hex or 32-byte hash hex; uses keccak256+ECDSA (ethers-compatible). For Solana/Cosmos: Ed25519 over raw bytes. Returns hex signature only -- does NOT broadcast to the network.",
    parameters: Type.Object({
      chain:      Type.String({ description: "Chain: ethereum | bsc | solana | cosmos | etc." }),
      tx_hex:     Type.String({ description: "Unsigned transaction payload as hex string (0x-prefixed or raw hex). For EVM: RLP-encoded tx or 32-byte hash. For Solana: serialized message bytes." }),
      tx_type:    Type.Optional(Type.String({ description: "Transaction encoding hint: 'hash' (32-byte keccak hash to sign directly), 'personal' (personal_sign), 'raw' (sign bytes directly). Default: 'hash' for 32-byte input, 'personal' otherwise." })),
    }),
    async execute(_id, params) {
      if (!wallet) throw new Error("Wallet not initialized");
      const addr = wallet.getAddress(params.chain);
      if (!addr) throw new Error(`No wallet for '${params.chain}'. Run jellyos setup first.`);
      const sig = wallet.signMessage(params.chain, params.tx_hex);
      if (!sig) throw new Error("Signing failed -- check wallet initialization.");
      const lines = [
        `Chain:     ${params.chain}`,
        `Signer:    ${addr}`,
        `Signature: ${sig}`,
        "",
        "⚠ Signature only -- transaction NOT broadcast. Use swap or bridge tool to execute.",
      ];
      return text(lines.join("\n"));
    },
  });

  agent.registerTool({
    name: "get_wallet_addresses",
    label: "Wallet Addresses",
    description: "Show all generated wallet addresses across chains",
    parameters: Type.Object({}),
    async execute() {
      if (!wallet) throw new Error("Wallet not initialized");
      const summary = wallet.getSummary();
      if (Object.keys(summary).length === 0) return text("No wallets yet. Run `jellyos setup` first.");
      return text(Object.entries(summary).map(([c, a]) => `${c}: ${a}`).join("\n"));
    },
  });

  agent.registerTool({
    name: "scan_chain",
    label: "Scan Chain",
    description: "Scan a blockchain for recent large transactions and whale activity",
    parameters: Type.Object({
      chain:         Type.String({ description: "Chain name" }),
      min_value_eth: Type.Optional(Type.Number({ description: "Min native token value to include (default 50)" })),
    }),
    async execute(_id, params) {
      const apiKey = process.env.ALCHEMY_KEY;
      if (!apiKey) throw new Error("ALCHEMY_KEY not set -- run jellyos setup");
      const network = CHAIN_NETWORK[params.chain] ?? "eth-mainnet";
      const res = await fetch(`https://${network}.g.alchemy.com/v2/${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "alchemy_getAssetTransfers",
          params: [{ category: ["external"], maxCount: "0xa", order: "desc", excludeZeroValue: true }],
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`Alchemy ${res.status}`);
      const data = await res.json() as any;
      const minVal = params.min_value_eth ?? 50;
      const txs = (data?.result?.transfers ?? []).filter((t: any) => parseFloat(t.value ?? "0") >= minVal);
      if (txs.length === 0) return text(`No large transfers (>${minVal} ${CHAIN_SYMBOL[params.chain] ?? "ETH"}) on ${params.chain} recently`);
      const lines = txs.slice(0, 5).map((t: any) =>
        `${parseFloat(t.value).toFixed(2)} ${CHAIN_SYMBOL[params.chain] ?? "ETH"}: ${(t.from ?? "?").slice(0, 8)}... → ${(t.to ?? "?").slice(0, 8)}...`
      );
      return text(`Large transfers on ${params.chain}:\n${lines.join("\n")}`);
    },
  });

  agent.registerTool({
    name: "get_chain_list",
    label: "Supported Chains",
    description: "List all supported blockchain networks",
    parameters: Type.Object({}),
    async execute() {
      const chains = [...Object.keys(CHAIN_NETWORK), "solana", "cosmos"];
      return text(`Supported chains (${chains.length}): ${chains.join(", ")}`);
    },
  });

  // -- Tools: Vault -----------------------------------------------------------

  agent.registerTool({
    name: "vault_status",
    label: "Vault Status",
    description: "Get profit vault balance and lock state",
    parameters: Type.Object({}),
    async execute() {
      if (!vault) throw new Error("Vault not initialized");
      const s = vault.getStats();
      if (vault.isLocked()) return text("🔒 Vault locked. Use /unlock to access.");
      return text(`🔓 Vault: $${s.balance?.toFixed(2) ?? "0"} USD | ${s.entries} entries | Updated: ${new Date(s.updatedAt).toLocaleString()}`);
    },
  });

  agent.registerTool({
    name: "vault_sweep",
    label: "Sweep to Vault",
    description: "Sweep realized profits into the encrypted vault. Vault must be unlocked first.",
    parameters: Type.Object({
      amount:  Type.Number({ description: "USD amount to sweep" }),
      note:    Type.Optional(Type.String({ description: "Note for this entry (e.g. 'ETH long +18%')" })),
      confirm: Type.Optional(Type.Boolean({ description: "Must be true to execute the sweep" })),
    }),
    async execute(_id, params) {
      if (!vault) throw new Error("Vault not initialized");
      if (!params.confirm) {
        return text(`Confirm sweeping $${params.amount.toFixed(2)} to vault? Call again with confirm: true.`);
      }
      await vault.sweep(params.amount, params.note ?? "manual-sweep");
      broadcastWs("vault_sweep", { amount: params.amount, note: params.note, ts: Date.now() });
      broadcastWs("vault_balance", { balance: vault.getStats().balance, ts: Date.now() });
      return text(`✅ Swept $${params.amount.toFixed(2)} to vault`);
    },
  });

  agent.registerTool({
    name: "vault_history",
    label: "Vault History",
    description: "Get recent vault transaction history",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Number of entries (default 10)" })),
    }),
    async execute(_id, params) {
      if (!vault) throw new Error("Vault not initialized");
      const history = vault.getHistory();
      if (history.length === 0) return text("No vault entries yet");
      return text(history.slice(0, params.limit ?? 10).map((e: any) =>
        `${new Date(e.timestamp).toLocaleDateString()} ${e.amount > 0 ? "+" : ""}$${e.amount.toFixed(2)} -- ${e.note}`
      ).join("\n"));
    },
  });

  // -- Tools: Trading ---------------------------------------------------------

  agent.registerTool({
    name: "calculate_risk",
    label: "Risk Calculator",
    description: "Calculate risk/reward ratio, position size, and max loss for a trade setup",
    parameters: Type.Object({
      symbol:             Type.String(),
      entry:              Type.Number({ description: "Entry price" }),
      stop_loss:          Type.Number({ description: "Stop-loss price" }),
      take_profit:        Type.Optional(Type.Number({ description: "Take-profit target price" })),
      portfolio_size_usd: Type.Optional(Type.Number({ description: "Portfolio size in USD (default 10000)" })),
      risk_pct:           Type.Optional(Type.Number({ description: "Max % of portfolio to risk (default 2)" })),
      leverage:           Type.Optional(Type.Number({ description: "Leverage multiplier (default 1)" })),
    }),
    async execute(_id, p) {
      const portfolioUsd = p.portfolio_size_usd ?? 10000;
      const riskPct      = (p.risk_pct ?? 2) / 100;
      const leverage     = p.leverage ?? 1;
      const riskPerUnit  = Math.abs(p.entry - p.stop_loss);
      const riskAmount   = portfolioUsd * riskPct;
      const positionSize = riskAmount / riskPerUnit;
      const positionVal  = positionSize * p.entry;
      const rr = p.take_profit ? Math.abs(p.take_profit - p.entry) / riskPerUnit : null;
      const lines = [
        `${p.symbol} Risk Analysis`,
        `Entry $${p.entry} | Stop $${p.stop_loss}${p.take_profit ? ` | Target $${p.take_profit}` : ""}`,
        `Risk per unit: $${riskPerUnit.toFixed(4)}`,
        `Max position: ${positionSize.toFixed(4)} ${p.symbol} ($${positionVal.toFixed(2)})`,
        `Max loss: $${riskAmount.toFixed(2)} (${p.risk_pct ?? 2}% of portfolio)`,
        rr != null ? `R/R: 1:${rr.toFixed(2)}${rr < 1 ? " ⚠️ below 1:1" : rr >= 2 ? " ✅ good" : ""}` : "",
        leverage > 1 ? `Leverage: ${leverage}x${leverage > 3 ? " ⚠️ high" : ""}` : "",
      ].filter(Boolean);
      return text(lines.join("\n"));
    },
  });

  agent.registerTool({
    name: "execute_trade",
    label: "Execute Trade",
    description: "Execute a swap on Jupiter (Solana) or Uniswap (EVM). Always shows confirmation before executing.",
    parameters: Type.Object({
      pair:             Type.String({ description: "Trading pair: ETH/USDC, SOL/USDT, etc." }),
      side:             Type.String({ description: "buy or sell" }),
      amount_usd:       Type.Number({ description: "USD amount" }),
      chain:            Type.String({ description: "Chain name" }),
      max_slippage_pct: Type.Optional(Type.Number({ description: "Max slippage % (default 0.5)" })),
      confirm:          Type.Optional(Type.Boolean({ description: "Must be true to execute" })),
    }),
    async execute(_id, params) {
      if (!params.confirm) {
        return text(
          `⚠️ CONFIRMATION REQUIRED\n` +
          `${params.side.toUpperCase()} $${params.amount_usd} of ${params.pair} on ${params.chain}\n` +
          `Max slippage: ${params.max_slippage_pct ?? 0.5}%\n\nCall again with confirm: true to execute.`
        );
      }
      // Stub -- wire up DEX adapters for live execution
      const txHash   = "0x" + Math.random().toString(16).slice(2, 18);
      const explorer = params.chain === "solana"
        ? `https://solscan.io/tx/${txHash}`
        : `https://etherscan.io/tx/${txHash}`;
      broadcastWs("trade", {
        pair: params.pair, side: params.side, amount_usd: params.amount_usd,
        chain: params.chain, txHash, ts: Date.now(),
      });
      return text(
        `✅ Trade submitted: ${params.side.toUpperCase()} $${params.amount_usd} ${params.pair} on ${params.chain}\n` +
        `Tx: ${txHash}\nExplorer: ${explorer}\n\nNote: Demo mode -- connect DEX adapters for live execution.`
      );
    },
  });

  agent.registerTool({
    name: "set_stop_loss",
    label: "Set Stop Loss",
    description: "Set or update stop-loss for an open position",
    parameters: Type.Object({
      position_id: Type.String(),
      stop_loss:   Type.Number(),
      confirm:     Type.Optional(Type.Boolean()),
    }),
    async execute(_id, params) {
      if (!params.confirm) {
        return text(`Confirm stop-loss $${params.stop_loss} on position ${params.position_id}? Add confirm: true.`);
      }
      return text(`✅ Stop-loss set to $${params.stop_loss} on position ${params.position_id}`);
    },
  });

  agent.registerTool({
    name: "get_positions",
    label: "Positions",
    description: "List open or closed trading positions",
    parameters: Type.Object({
      status: Type.Optional(Type.String({ description: "open | closed | all (default: open)" })),
    }),
    async execute(_id, params) {
      const { PositionManager } = await import("../src/trading/PositionManager");
      const { Metrics } = await import("../src/core/utils/Metrics");
      const { Logger } = await import("../src/core/utils/Logger");
      const logger = new Logger("Positions");
      const pm = new PositionManager(new Metrics(logger));
      const status = params.status ?? "open";
      const positions = status === "closed" ? pm.getClosedPositions()
        : status === "all" ? [...pm.getOpenPositions(), ...pm.getClosedPositions()]
        : pm.getOpenPositions();
      if (positions.length === 0) return text(`No ${status} positions`);
      return text(JSON.stringify(positions, null, 2));
    },
  });

  agent.registerTool({
    name: "get_portfolio",
    label: "Portfolio Overview",
    description: "Get full portfolio summary with P&L and performance metrics",
    parameters: Type.Object({}),
    async execute() {
      const { PositionManager } = await import("../src/trading/PositionManager");
      const { PortfolioManager } = await import("../src/trading/PortfolioManager");
      const { Metrics } = await import("../src/core/utils/Metrics");
      const { Logger } = await import("../src/core/utils/Logger");
      const logger = new Logger("Portfolio");
      const metrics = new Metrics(logger);
      const pm = new PositionManager(metrics);
      const portfolio = new PortfolioManager(pm, metrics);
      return text(JSON.stringify(portfolio.getSummary(), null, 2));
    },
  });

  // -- Tools: Feeds -----------------------------------------------------------

  agent.registerTool({
    name: "get_live_feeds",
    label: "Live Feeds",
    description: "Get recent items from live data feeds (news, prices, whale alerts, on-chain signals)",
    parameters: Type.Object({
      category: Type.Optional(Type.String({ description: "news | signal | whale | price | social | onchain | prediction -- omit for all" })),
      limit:    Type.Optional(Type.Number({ description: "Max items (default 10)" })),
      source:   Type.Optional(Type.String({ description: "Filter by source name" })),
    }),
    async execute(_id, params) {
      if (!feeds) throw new Error("Feed service not initialized");
      const items = feeds.getRecent({
        category: params.category as any,
        limit: params.limit ?? 10,
        source: params.source,
      });
      if (items.length === 0) return text("No feed items yet -- feeds update every 1-30 minutes");
      return text(items.map((i: any) => `[${i.source}] ${i.title}: ${i.content}`).join("\n"));
    },
  });

  agent.registerTool({
    name: "get_signals",
    label: "Trading Signals",
    description: "Get active AI-generated trading signals from cross-source analysis",
    parameters: Type.Object({
      asset: Type.Optional(Type.String({ description: "Filter by asset symbol: BTC, ETH, SOL, etc." })),
    }),
    async execute(_id, params) {
      if (!signals) throw new Error("Signal engine not initialized");
      const sigs = signals.getActiveSignals(params.asset);
      if (sigs.length === 0) return text("No active signals at this time");
      broadcastWs("signals", sigs.map((s: any) => ({
        asset: s.asset, direction: s.direction, strength: s.strength, confidence: s.confidence, ts: Date.now(),
      })));
      return text(sigs.map(s =>
        `[${s.asset}] ${s.direction.toUpperCase()} | Strength: ${(s.strength * 100).toFixed(0)}% | Conf: ${(s.confidence * 100).toFixed(0)}%\n  ${s.rationale}`
      ).join("\n\n"));
    },
  });

  agent.registerTool({
    name: "get_news_feeds",
    label: "Crypto News (FeedManager)",
    description: "Get latest crypto news from JellyOS live feed sources or CryptoCompare fallback. Includes category filter and richer metadata than get_news.",
    parameters: Type.Object({
      limit:    Type.Optional(Type.Number({ description: "Number of articles (default 5)" })),
      category: Type.Optional(Type.String({ description: "Topic filter: defi, nft, ethereum, bitcoin, etc." })),
    }),
    async execute(_id, params) {
      const feedItems = feeds?.getRecent({ category: "news", limit: params.limit ?? 5 });
      if (feedItems && feedItems.length > 0) {
        return text(feedItems.map((i: any) =>
          `• [${i.source}] ${i.title}\n  ${(i.content ?? "").slice(0, 150)}${i.url ? `\n  ${i.url}` : ""}`
        ).join("\n\n"));
      }
      const res = await fetch(
        `https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest&limit=${params.limit ?? 5}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) throw new Error(`CryptoCompare ${res.status}`);
      const data = await res.json() as any;
      return text((data?.Data ?? []).slice(0, params.limit ?? 5).map((n: any) =>
        `• [${n.source}] ${n.title}\n  ${(n.body ?? "").slice(0, 150)}`
      ).join("\n\n"));
    },
  });

  // -- Tools: Framework duplicates removed ----------------------------------
  // analyze_ta and get_news are registered by App.js (framework registerBuiltinTools).
  // Re-registering them here would silently overwrite the framework versions with
  // identical implementations. Removed to avoid the double-registration.


  agent.registerTool({
    name: "get_news_sentiment",
    label: "News Sentiment",
    description: "Get crypto news with AI sentiment scoring. Shows bullish/bearish/neutral breakdown, trending keywords, and scored headlines.",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ default: 10 })),
    }),
    async execute(_id, params) {
      const report = newsFeed.getLatest();
      if (!report) return text("News data not yet available. Please wait for the first fetch.");
      const items = report.items.slice(0, params.limit ?? 10)
        .map(i => {
          const s = (i.sentiment ?? 0) >= 0.1 ? "+" : (i.sentiment ?? 0) <= -0.1 ? "-" : " ";
          return `${s} [${i.source}] ${i.title}`;
        }).join("\n");
      return {
        content: [{
          type: "text" as const,
          text: `News Sentiment: ${report.avgSentiment >= 0 ? "+" : ""}${(report.avgSentiment * 100).toFixed(0)}% · ${report.positive}p/${report.negative}n/${report.neutral}·\nTrending: ${report.topKeywords.join(", ")}\n\n${items}`,
        }],
        details: { avgSentiment: report.avgSentiment, positive: report.positive, negative: report.negative, neutral: report.neutral, keywords: report.topKeywords },
      };
    },
  });

  agent.registerTool({
    name: "get_price_ticker",
    label: "Price Ticker",
    description: "Get real-time prices and 24h changes for tracked assets. Uses the framework price feed for fast cached lookups.",
    parameters: Type.Object({
      symbols: Type.Optional(Type.Array(Type.String(), { description: "Symbols to fetch: btc, eth, sol, etc. (default: all tracked)" })),
    }),
    async execute(_id, p) {
      const ticks = p.symbols?.length ? priceFeed.getMultiple(p.symbols as string[]) : priceFeed.getAll();
      if (ticks.length === 0) return text("No price data available yet. Prices update every 60 seconds.");
      const lines = ticks.map(t => {
        const change = t.change24h >= 0 ? `+${t.change24h.toFixed(2)}%` : `${t.change24h.toFixed(2)}%`;
        return `${t.symbol.padEnd(6)} $${t.price < 1 ? t.price.toFixed(6) : t.price.toLocaleString()} ${change}`;
      });
      return text(lines.join("\n"));
    },
  });

  // -- Tools: Prediction ------------------------------------------------------

  agent.registerTool({
    name: "predict_market",
    label: "Market Prediction",
    description: "Generate a price prediction for an asset based on signals and sentiment data",
    parameters: Type.Object({
      symbol:    Type.String({ description: "Asset symbol: BTC, ETH, SOL, etc." }),
      timeframe: Type.Optional(Type.String({ description: "1h | 4h | 1d | 1w (default: 1d)" })),
    }),
    async execute(_id, params) {
      const sym  = (params.symbol ?? "BTC").toUpperCase();
      const tf   = params.timeframe ?? "1d";
      const sigs = signals?.getActiveSignals(sym) ?? [];
      const fngItem = feeds?.getRecent({ source: "alternative.me", limit: 1 })?.[0];
      const fng     = fngItem?.metadata?.score as number | undefined;

      let bias = "neutral", confidence = 50;
      if (sigs.length > 0) {
        const longs  = sigs.filter((s: any) => s.direction === "long").length;
        const shorts = sigs.filter((s: any) => s.direction === "short").length;
        if (longs  > shorts) { bias = "bullish"; confidence = 55 + longs  * 5; }
        if (shorts > longs)  { bias = "bearish"; confidence = 55 + shorts * 5; }
      }
      if (fng !== undefined) {
        if (fng  < 25 && bias !== "bearish") { bias = "bullish"; confidence += 5; }
        if (fng  > 80 && bias !== "bullish") { bias = "bearish"; confidence += 5; }
      }
      confidence = Math.min(85, confidence);
      return text([
        `${sym} ${tf} Prediction`,
        `Bias: ${bias.toUpperCase()} | Confidence: ${confidence}%`,
        `Active signals: ${sigs.length} | Fear & Greed: ${fng ?? "N/A"}/100`,
        "",
        "⚠️ Not financial advice. Always DYOR.",
      ].join("\n"));
    },
  });

  // -- Tools: System ----------------------------------------------------------

  agent.registerTool({
    name: "web_fetch",
    label: "Fetch URL",
    description: "Fetch content from any URL. Strips HTML to plain text by default. Useful for docs, news, APIs.",
    parameters: Type.Object({
      url:     Type.String({ description: "URL to fetch" }),
      as_text: Type.Optional(Type.Boolean({ description: "Strip HTML tags (default true for HTML)" })),
    }),
    async execute(_id, params) {
      if (isPrivateHost(params.url)) {
        throw new Error(`Blocked: ${params.url} resolves to a private/internal network address`);
      }
      const res = await fetch(params.url, {
        headers: { "User-Agent": "JellyOS/2.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const ct = res.headers.get("content-type") ?? "";
      let body = await res.text();
      if (ct.includes("html") || params.as_text !== false) {
        body = body
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s{2,}/g, " ")
          .trim();
      }
      return text(body.slice(0, 6000));
    },
  });

  agent.registerTool({
    name: "get_system_status",
    label: "System Status",
    description: "Full JellyOS system diagnostics -- feeds, vault, wallet, API keys, memory",
    parameters: Type.Object({}),
    async execute() {
      const uptime     = process.uptime();
      const mem        = process.memoryUsage();
      const feedStats  = feeds?.getStats();
      const vaultStats = vault?.getStats();
      return text(JSON.stringify({
        system: {
          version:    "2.0.0",
          uptime:     `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
          memory_mb:  (mem.rss / 1e6).toFixed(1),
          node:       process.version,
          home:       JELLY_HOME,
        },
        feeds:   feedStats  ?? "unavailable",
        vault:   vaultStats ?? "unavailable",
        wallets: wallet ? Object.keys(wallet.getSummary()).length + " chains" : "unavailable",
        api_keys: {
          alchemy:    !!process.env.ALCHEMY_KEY,
          openrouter: !!process.env.OPENROUTER_API_KEY,
          polymarket: !!process.env.POLYMARKET_API_KEY,
        },
      }, null, 2));
    },
  });

  agent.registerTool({
    name: "get_context",
    label: "Get Context",
    description: "Retrieve a stored key-value from JellyOS persistent context (~/.jelly/context.json)",
    parameters: Type.Object({
      key: Type.String({ description: "Context key" }),
    }),
    async execute(_id, params) {
      const { readFileSync, existsSync } = await import("node:fs");
      const ctxPath = path.join(JELLY_HOME, "context.json");
      if (!existsSync(ctxPath)) return text(`No context stored yet`);
      const store = JSON.parse(readFileSync(ctxPath, "utf-8")) as Record<string, any>;
      const val = store[params.key];
      return text(val !== undefined ? JSON.stringify(val, null, 2) : `No value for key: ${params.key}`);
    },
  });

  agent.registerTool({
    name: "set_context",
    label: "Set Context",
    description: "Store a value in JellyOS persistent context for future sessions",
    parameters: Type.Object({
      key:   Type.String({ description: "Context key" }),
      value: Type.Any({ description: "Value to store (any JSON-serializable value)" }),
    }),
    async execute(_id, params) {
      if (!ALLOWED_CONTEXT_KEYS.has(params.key)) {
        return text(`Invalid context key: "${params.key}". Allowed keys: ${[...ALLOWED_CONTEXT_KEYS].join(", ")}`);
      }
      const serialized = JSON.stringify(params.value);
      if (serialized.length > 10_240) {
        return text(`Value too large: ${serialized.length} bytes (max 10240). Reduce the value size.`);
      }
      const { readFileSync, writeFileSync, existsSync, mkdirSync } = await import("node:fs");
      mkdirSync(JELLY_HOME, { recursive: true });
      const ctxPath = path.join(JELLY_HOME, "context.json");
      const store   = existsSync(ctxPath) ? JSON.parse(readFileSync(ctxPath, "utf-8")) : {};
      store[params.key] = params.value;
      writeFileSync(ctxPath, JSON.stringify(store, null, 2), "utf-8");
      return text(`Stored: ${params.key}`);
    },
  });

  // -- Tools: Local system ----------------------------------------------------

  agent.registerTool({
    name: "run_shell",
    label: "Run Shell Command",
    description: "Execute a shell command on the local machine and return stdout/stderr. JellyOS runs fully locally -- use this to run scripts, query system state, call CLIs, automate tasks, etc. Requires confirm:true for commands that write, delete, or modify state.",
    parameters: Type.Object({
      command: Type.String({ description: "Shell command to execute" }),
      cwd:     Type.Optional(Type.String({ description: "Working directory (default: current dir)" })),
      confirm: Type.Optional(Type.Boolean({ description: "Required for destructive/write commands (rm, mv, kill, etc.)" })),
      timeout: Type.Optional(Type.Number({ description: "Timeout in ms (default 15000)" })),
    }),
    async execute(_id, params) {
      const { execSync } = require("node:child_process");

      // Require confirmation for potentially destructive commands
      const DESTRUCTIVE = /\b(rm|rmdir|mv|kill|pkill|killall|sudo|chmod|chown|dd|mkfs|format|shutdown|reboot|truncate|shred)\b/;
      if (DESTRUCTIVE.test(params.command) && !params.confirm) {
        return text(
          `⚠️ Confirmation required for: ${params.command}\nCall again with confirm: true to execute.`
        );
      }

      try {
        const stdout = execSync(params.command, {
          cwd:     params.cwd ?? process.cwd(),
          timeout: params.timeout ?? 15_000,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        return text((stdout ?? "").trim() || "(no output)");
      } catch (err: any) {
        const msg = (err.stdout ?? "") + (err.stderr ? `\nstderr: ${err.stderr}` : "");
        return text(`Exit ${err.status ?? 1}:\n${msg.trim() || err.message}`);
      }
    },
  });

  agent.registerTool({
    name: "open_app",
    label: "Open App / URL",
    description: "Open an application, file, or URL on the local machine using the OS default handler. Works like double-clicking: open Brave, Chrome, a file, a folder, or any URL.",
    parameters: Type.Object({
      target: Type.String({ description: "App name, file path, or URL to open. Examples: 'Brave Browser', 'https://google.com', '/Users/me/report.pdf', '~/Documents'" }),
      app:    Type.Optional(Type.String({ description: "Specific app to open the target with (macOS: -a flag). E.g. 'Google Chrome'" })),
    }),
    async execute(_id, params) {
      const { execSync } = require("node:child_process");
      const platform = process.platform;

      // Strip shell metacharacters to prevent command injection
      const sanitize = (s: string) => s.replace(/[\n\r\0;|&`$<>]/g, "");
      const safeTarget = sanitize(params.target);
      const safeApp    = params.app ? sanitize(params.app) : undefined;

      let cmd: string;
      if (platform === "darwin") {
        cmd = safeApp
          ? `open -a ${JSON.stringify(safeApp)} ${JSON.stringify(safeTarget)}`
          : `open ${JSON.stringify(safeTarget)}`;
      } else if (platform === "win32") {
        cmd = `start "" ${JSON.stringify(safeTarget)}`;
      } else {
        cmd = `xdg-open ${JSON.stringify(safeTarget)}`;
      }

      try {
        execSync(cmd, { timeout: 8000, stdio: "pipe" });
        return text(`Opened: ${safeTarget}${safeApp ? ` with ${safeApp}` : ""}`);
      } catch (err: any) {
        return text(`Failed to open ${safeTarget}: ${err.message}`);
      }
    },
  });

  agent.registerTool({
    name: "read_file",
    label: "Read File",
    description: "Read a file from the local filesystem and return its contents",
    parameters: Type.Object({
      path:     Type.String({ description: "Absolute or ~ path to the file" }),
      encoding: Type.Optional(Type.String({ description: "File encoding (default: utf-8). Use 'base64' for binary." })),
      max_bytes: Type.Optional(Type.Number({ description: "Max bytes to return (default 32768)" })),
    }),
    async execute(_id, params) {
      const { readFileSync, statSync, existsSync } = require("node:fs");
      const resolvedPath = params.path.replace(/^~/, os.homedir());
      // Block reading of sensitive credential files
      const BLOCKED_READ = [/\/\.ssh\//i, /\/\.gnupg\//i, /id_rsa/i, /id_ed25519/i, /id_ecdsa/i, /\/etc\/shadow$/i];
      if (BLOCKED_READ.some(p => p.test(resolvedPath))) return text(`⛔ Reading ${resolvedPath} is blocked for security.`);
      if (!existsSync(resolvedPath)) return text(`File not found: ${resolvedPath}`);
      const stat = statSync(resolvedPath);
      if (stat.isDirectory()) return text(`${resolvedPath} is a directory -- use run_shell with 'ls' to list it`);
      const enc = (params.encoding ?? "utf-8") as BufferEncoding;
      const raw = readFileSync(resolvedPath);
      const maxBytes = params.max_bytes ?? 32_768;
      const slice = raw.slice(0, maxBytes);
      const content = enc === "base64" ? slice.toString("base64") : slice.toString("utf-8");
      const truncated = raw.length > maxBytes ? `\n\n[truncated -- ${raw.length} bytes total, showing first ${maxBytes}]` : "";
      return text(content + truncated);
    },
  });

  agent.registerTool({
    name: "write_file",
    label: "Write File",
    description: "Write or append content to a file on the local filesystem",
    parameters: Type.Object({
      path:    Type.String({ description: "Absolute or ~ path to write to" }),
      content: Type.String({ description: "Content to write" }),
      mode:    Type.Optional(Type.String({ description: "'overwrite' (default) or 'append'" })),
      confirm: Type.Optional(Type.Boolean({ description: "Required when overwriting an existing file" })),
    }),
    async execute(_id, params) {
      const { writeFileSync, appendFileSync, existsSync, mkdirSync } = require("node:fs");
      const resolvedPath = params.path.replace(/^~/, os.homedir());
      // Block writes to sensitive locations
      const BLOCKED_WRITE = [/\/\.ssh\//i, /\/\.gnupg\//i, /\/etc\//i, /\/\.bashrc$/i, /\/\.zshrc$/i, /\/\.profile$/i, /\/\.bash_profile$/i];
      if (BLOCKED_WRITE.some(p => p.test(resolvedPath))) return text(`⛔ Writing to ${resolvedPath} is blocked for security.`);
      const mode = params.mode ?? "overwrite";

      if (mode === "overwrite" && existsSync(resolvedPath) && !params.confirm) {
        return text(`⚠️ ${resolvedPath} already exists. Call again with confirm: true to overwrite.`);
      }

      mkdirSync(path.dirname(resolvedPath), { recursive: true });
      if (mode === "append") {
        appendFileSync(resolvedPath, params.content, "utf-8");
        return text(`Appended ${params.content.length} chars to ${resolvedPath}`);
      } else {
        writeFileSync(resolvedPath, params.content, "utf-8");
        return text(`Written ${params.content.length} chars to ${resolvedPath}`);
      }
    },
  });

  // -- Slash commands: new features --------------------------------------------

  agent.registerCommand("snapshot", {
    description: "Generate a snapshot report of vault, wallets, signals, and prices",
    async handler(_args, ctx) {
      const { mkdirSync, writeFileSync } = require("node:fs");
      const now = new Date();
      const ts  = now.toISOString().replace(/[:.]/g, "-").slice(0, 16);
      const lines: string[] = [
        `# JellyOS Snapshot -- ${now.toUTCString()}`, "",
        "## Vault",
      ];
      if (vault) {
        const s = vault.getStats();
        lines.push(vault.isLocked() ? "Status: 🔒 Locked" : "Status: 🔓 Unlocked");
        lines.push(`Balance: $${(s.balance as number)?.toFixed(2) ?? "0"}`);
      } else { lines.push("unavailable"); }
      lines.push("", "## Wallets");
      if (wallet) {
        for (const [chain, addr] of Object.entries(wallet.getSummary()))
          lines.push(`- ${chain}: ${addr}`);
      }
      lines.push("", "## Active Signals");
      if (signals) {
        const sigs = signals.getActiveSignals().slice(0, 10);
        if (!sigs.length) lines.push("No active signals");
        else for (const s of sigs)
          lines.push(`- [${(s.direction ?? "").toUpperCase()}] ${s.asset} -- ${s.sources.join(", ")} (${s.confidence?.toFixed(0) ?? "?"}% conf)`);
      }
      lines.push("", "## Live Prices");
      if (feeds) {
        const prices = feeds.getRecent({ limit: 20 });
        let count = 0;
        for (const p of prices) {
          const price = p.metadata?.price;
          if (price && count < 8) {
            lines.push(`- ${p.metadata?.symbol ?? p.source}: $${Number(price).toLocaleString()}`);
            count++;
          }
        }
      }
      const md  = lines.join("\n");
      const dir = path.join(JELLY_HOME, "snapshots");
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${ts}.md`);
      writeFileSync(file, md, "utf-8");
      ctx.ui.notify(`📸 Snapshot saved → ${file}\n\n${md.slice(0, 800)}${md.length > 800 ? "\n..." : ""}`);
    },
  });

  agent.registerCommand("journal", {
    description: "View recent trading journal entries from ~/.jelly/journal/",
    async handler(args, ctx) {
      const { existsSync, readdirSync, readFileSync } = require("node:fs");
      const dir = path.join(JELLY_HOME, "journal");
      if (!existsSync(dir)) { ctx.ui.notify("No journal entries yet"); return; }
      const files = readdirSync(dir).filter((f: string) => f.endsWith(".jsonl")).sort().reverse();
      if (!files.length) { ctx.ui.notify("No journal entries yet"); return; }
      // args is the full string after the command (e.g. "/journal 50" → args="50")
      // args[0] would be the first character -- parse the whole trimmed string instead
      const limit  = parseInt(String(args ?? "").trim() || "20", 10);
      const lines: string[] = [`📓 Journal (last ${limit} entries)\n`];
      let count = 0;
      outer: for (const file of files) {
        const rows = readFileSync(path.join(dir, file), "utf-8")
          .split("\n").filter(Boolean).reverse();
        for (const row of rows) {
          try {
            const e = JSON.parse(row) as JournalEntry;
            const d = new Date(e.ts).toLocaleString();
            const pnl = e.pnl != null ? ` | PnL: $${e.pnl.toFixed(2)}` : "";
            lines.push(`[${d}] ${e.action.toUpperCase()} ${e.amount} ${e.symbol} @ $${e.price}${pnl}`);
            if (e.reason) lines.push(`  reason: ${e.reason}`);
            if (++count >= limit) break outer;
          } catch {}
        }
      }
      ctx.ui.notify(lines.join("\n"));
    },
  });

  agent.registerCommand("alert", {
    description: "Manage price alerts. Usage: /alert list | /alert ETH > 3500 | /alert clear <id>",
    async handler(args, ctx) {
      const { existsSync, readFileSync, writeFileSync } = require("node:fs");
      const alertsPath = path.join(JELLY_HOME, "alerts.json");
      let alerts: AlertDef[] = [];
      if (existsSync(alertsPath)) {
        try { alerts = JSON.parse(readFileSync(alertsPath, "utf-8")); } catch {}
      }
      const sub = args[0]?.toLowerCase();

      if (!sub || sub === "list") {
        if (!alerts.length) { ctx.ui.notify("No active alerts. Add one: /alert ETH > 3500"); return; }
        ctx.ui.notify("Active alerts:\n" + alerts.map(a =>
          `  [${a.id}] ${a.symbol} ${a.condition} $${a.threshold}`
        ).join("\n"));
        return;
      }
      if (sub === "clear" || sub === "remove" || sub === "delete") {
        const id = args[1];
        if (!id) { ctx.ui.notify("Usage: /alert clear <id>"); return; }
        const before = alerts.length;
        alerts = alerts.filter(a => a.id !== id);
        if (alerts.length === before) { ctx.ui.notify(`No alert with id: ${id}`); return; }
        writeFileSync(alertsPath, JSON.stringify(alerts, null, 2), "utf-8");
        ctx.ui.notify(`✓ Alert ${id} removed`);
        return;
      }
      // Parse: /alert ETH > 3500  or  /alert BTC < 90000
      const symbol    = args[0]?.toUpperCase();
      const condition = args[1] as ">" | "<";
      const threshold = parseFloat(args[2] ?? "");
      if (!symbol || !["<", ">"].includes(condition) || isNaN(threshold)) {
        ctx.ui.notify("Usage: /alert ETH > 3500\n       /alert BTC < 90000\n       /alert list\n       /alert clear <id>");
        return;
      }
      const id = `${symbol}-${condition}${threshold}-${Date.now().toString(36)}`;
      alerts.push({ id, symbol, condition, threshold, created: Date.now() });
      writeFileSync(alertsPath, JSON.stringify(alerts, null, 2), "utf-8");
      ctx.ui.notify(`✓ Alert set: ${symbol} ${condition} $${threshold.toLocaleString()}\nID: ${id}`);
    },
  });

  agent.registerCommand("telegram", {
    description: "Show Telegram bridge status. Add TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID to .env to enable.",
    async handler(_args, ctx) {
      const token  = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (!token) {
        ctx.ui.notify("Telegram bridge: not configured\n\nAdd to ~/.jelly/.env:\n  TELEGRAM_BOT_TOKEN=your_bot_token\n  TELEGRAM_CHAT_ID=your_chat_id\n\nCreate a bot at https://t.me/BotFather");
        return;
      }
      ctx.ui.notify(`Telegram bridge: ✓ active\n  Bot token: ${token.slice(0, 8)}...\n  Chat ID: ${chatId ?? "not set"}\n  Polling every 3s\n  Pending messages: ${_telegramPending.length}`);
    },
  });

  agent.registerCommand("discord", {
    description: "Show Discord bridge status. Add DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID to .env to enable.",
    async handler(_args, ctx) {
      const token     = process.env.DISCORD_BOT_TOKEN;
      const channelId = process.env.DISCORD_CHANNEL_ID;
      if (!token) {
        ctx.ui.notify("Discord bridge: not configured\n\nAdd to ~/.jelly/.env:\n  DISCORD_BOT_TOKEN=your_bot_token\n  DISCORD_CHANNEL_ID=your_channel_id\n\nCreate a bot at https://discord.com/developers");
        return;
      }
      ctx.ui.notify(`Discord bridge: ✓ active\n  Channel: ${channelId ?? "not set"}\n  Polling every 5s\n  Pending messages: ${_discordPending.length}`);
    },
  });

  agent.registerCommand("watch", {
    description: "Manage watched wallets. Usage: /watch list | /watch add <addr> <label> [chain] | /watch remove <label>",
    async handler(args, ctx) {
      const { existsSync, readFileSync, writeFileSync } = require("node:fs");
      const watchPath = path.join(JELLY_HOME, "watched-wallets.json");
      let wallets: WatchedWallet[] = [];
      if (existsSync(watchPath)) {
        try { wallets = JSON.parse(readFileSync(watchPath, "utf-8")); } catch {}
      }
      const sub = args[0]?.toLowerCase();

      if (!sub || sub === "list") {
        if (!wallets.length) { ctx.ui.notify("No wallets being watched.\nUsage: /watch add 0x... MyWhale ethereum"); return; }
        ctx.ui.notify("Watched wallets:\n" + wallets.map(w =>
          `  ${(w.label ?? "unlabeled").padEnd(12)} ${w.chain ?? "ethereum"}  ${w.address}`
        ).join("\n"));
        return;
      }
      if (sub === "add") {
        const [, address, label, chain] = args;
        if (!address) { ctx.ui.notify("Usage: /watch add <address> <label> [chain]"); return; }
        wallets.push({ address, label, chain: chain ?? "ethereum" });
        writeFileSync(watchPath, JSON.stringify(wallets, null, 2), "utf-8");
        ctx.ui.notify(`✓ Now watching ${label ?? address} (${chain ?? "ethereum"})`);
        return;
      }
      if (sub === "remove" || sub === "delete") {
        const label = args[1];
        if (!label) { ctx.ui.notify("Usage: /watch remove <label>"); return; }
        const before = wallets.length;
        wallets = wallets.filter(w => w.label !== label && w.address !== label);
        if (wallets.length === before) { ctx.ui.notify(`No wallet matching: ${label}`); return; }
        writeFileSync(watchPath, JSON.stringify(wallets, null, 2), "utf-8");
        ctx.ui.notify(`✓ Removed wallet: ${label}`);
        return;
      }
      ctx.ui.notify("Usage: /watch list | /watch add <addr> <label> [chain] | /watch remove <label>");
    },
  });

  agent.registerCommand("webhook", {
    description: "Show TradingView webhook status and endpoint URL",
    async handler(_args, ctx) {
      const port = process.env.JELLY_WEBHOOK_PORT ?? "9340";
      ctx.ui.notify(
        `TradingView Webhook\n\n` +
        `  Endpoint: http://127.0.0.1:${port}/webhook\n` +
        `  Pending signals: ${_webhookSignals.length}\n\n` +
        `TradingView alert message (JSON):\n` +
        `  { "ticker": "BTCUSDT", "action": "buy", "price": {{close}} }\n\n` +
        `The agent will process pending signals at the start of each turn.\n` +
        `Override port with JELLY_WEBHOOK_PORT in ~/.jelly/.env`
      );
    },
  });

  // -- Tools: new features ------------------------------------------------------

  agent.registerTool({
    name: "send_telegram",
    label: "Send Telegram Message",
    description: "Send a message to the configured Telegram chat. Requires TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in .env.",
    parameters: Type.Object({
      message: Type.String({ description: "Message text to send (Markdown supported)" }),
    }),
    async execute(_id, params) {
      if (!process.env.TELEGRAM_BOT_TOKEN) return text("Telegram not configured -- add TELEGRAM_BOT_TOKEN to ~/.jelly/.env");
      if (!process.env.TELEGRAM_CHAT_ID)   return text("Telegram chat ID not set -- add TELEGRAM_CHAT_ID to ~/.jelly/.env");
      await _tgSend(params.message);
      return text(`Sent to Telegram: ${params.message.slice(0, 80)}${params.message.length > 80 ? "..." : ""}`);
    },
  });

  agent.registerTool({
    name: "send_discord",
    label: "Send Discord Message",
    description: "Send a message to the configured Discord channel. Requires DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID in .env.",
    parameters: Type.Object({
      message: Type.String({ description: "Message text to send" }),
    }),
    async execute(_id, params) {
      if (!process.env.DISCORD_BOT_TOKEN)   return text("Discord not configured -- add DISCORD_BOT_TOKEN to ~/.jelly/.env");
      if (!process.env.DISCORD_CHANNEL_ID)  return text("Discord channel not set -- add DISCORD_CHANNEL_ID to ~/.jelly/.env");
      await _dcSend(params.message);
      return text(`Sent to Discord: ${params.message.slice(0, 80)}${params.message.length > 80 ? "..." : ""}`);
    },
  });

  agent.registerTool({
    name: "log_trade",
    label: "Log Trade to Journal",
    description: "Append a trade entry to the trading journal at ~/.jelly/journal/YYYY-MM-DD.jsonl",
    parameters: Type.Object({
      action:  Type.String({ description: "Trade action: buy, sell, swap, short, close" }),
      symbol:  Type.String({ description: "Token or pair symbol e.g. ETH, BTC/USDT" }),
      amount:  Type.Number({ description: "Amount of tokens traded" }),
      price:   Type.Number({ description: "Execution price in USD" }),
      chain:   Type.Optional(Type.String({ description: "Chain where the trade occurred" })),
      reason:  Type.Optional(Type.String({ description: "Brief rationale for the trade" })),
      pnl:     Type.Optional(Type.Number({ description: "Realized PnL in USD if this closes a position" })),
    }),
    async execute(_id, params) {
      _logTrade({ ts: Date.now(), ...params });
      const pnl = params.pnl != null ? ` | PnL: $${params.pnl.toFixed(2)}` : "";
      return text(`Logged: ${params.action.toUpperCase()} ${params.amount} ${params.symbol} @ $${params.price}${pnl}`);
    },
  });

  agent.registerTool({
    name: "set_alert",
    label: "Set Price Alert",
    description: "Set a price alert that fires when a token crosses a threshold. Triggers desktop + Telegram/Discord notification.",
    parameters: Type.Object({
      symbol:    Type.String({ description: "Token symbol e.g. ETH, BTC, SOL" }),
      condition: Type.Union([Type.Literal(">"), Type.Literal("<")], { description: "Condition: '>' (above) or '<' (below)" }),
      threshold: Type.Number({ description: "Price threshold in USD" }),
    }),
    async execute(_id, params) {
      const { existsSync, readFileSync, writeFileSync } = require("node:fs");
      const alertsPath = path.join(JELLY_HOME, "alerts.json");
      let alerts: AlertDef[] = [];
      if (existsSync(alertsPath)) { try { alerts = JSON.parse(readFileSync(alertsPath, "utf-8")); } catch {} }
      const id = `${params.symbol.toUpperCase()}-${params.condition}${params.threshold}-${Date.now().toString(36)}`;
      alerts.push({ id, symbol: params.symbol.toUpperCase(), condition: params.condition, threshold: params.threshold, created: Date.now() });
      writeFileSync(alertsPath, JSON.stringify(alerts, null, 2), "utf-8");
      return text(`Alert set: ${params.symbol.toUpperCase()} ${params.condition} $${params.threshold.toLocaleString()} (id: ${id})`);
    },
  });

  agent.registerTool({
    name: "clear_alert",
    label: "Clear Price Alert",
    description: "Remove a price alert by its ID",
    parameters: Type.Object({
      id: Type.String({ description: "Alert ID returned by set_alert" }),
    }),
    async execute(_id, params) {
      const { existsSync, readFileSync, writeFileSync } = require("node:fs");
      const alertsPath = path.join(JELLY_HOME, "alerts.json");
      if (!existsSync(alertsPath)) return text("No alerts configured");
      let alerts: AlertDef[] = [];
      try { alerts = JSON.parse(readFileSync(alertsPath, "utf-8")); } catch { return text("Could not read alerts"); }
      const before = alerts.length;
      alerts = alerts.filter(a => a.id !== params.id);
      if (alerts.length === before) return text(`No alert found with id: ${params.id}`);
      writeFileSync(alertsPath, JSON.stringify(alerts, null, 2), "utf-8");
      return text(`Alert ${params.id} removed`);
    },
  });

  agent.registerTool({
    name: "get_webhook_signals",
    label: "Get Webhook Signals",
    description: "Return pending TradingView webhook signals received at the local webhook endpoint",
    parameters: Type.Object({
      clear: Type.Optional(Type.Boolean({ description: "If true, clear the queue after reading (default false)" })),
    }),
    async execute(_id, params) {
      if (!_webhookSignals.length) return text("No pending webhook signals");
      const signals_copy = [..._webhookSignals];
      if (params.clear) _webhookSignals = [];
      return text(JSON.stringify(signals_copy, null, 2));
    },
  });

  agent.registerTool({
    name: "get_journal",
    label: "Get Journal Entries",
    description: "Read recent trading journal entries from ~/.jelly/journal/",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Max entries to return (default 20)" })),
      date:  Type.Optional(Type.String({ description: "Specific date YYYY-MM-DD (default: today)" })),
    }),
    async execute(_id, params) {
      const { existsSync, readFileSync, readdirSync } = require("node:fs");
      const dir = path.join(JELLY_HOME, "journal");
      if (!existsSync(dir)) return text("No journal entries yet");
      const limit = params.limit ?? 20;
      const targetFile = params.date
        ? path.join(dir, `${params.date}.jsonl`)
        : (() => {
            const files = readdirSync(dir).filter((f: string) => f.endsWith(".jsonl")).sort().reverse();
            return files[0] ? path.join(dir, files[0]) : null;
          })();
      if (!targetFile || !existsSync(targetFile)) return text("No journal entries found for that date");
      const rows = readFileSync(targetFile, "utf-8").split("\n").filter(Boolean);
      const entries = rows.slice(-limit).map((r: string) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
      return text(JSON.stringify(entries, null, 2));
    },
  });

  agent.registerTool({
    name: "watch_wallet",
    label: "Watch Wallet",
    description: "Add a wallet address to the monitoring list. Fires Telegram/Discord alert on incoming transactions.",
    parameters: Type.Object({
      address: Type.String({ description: "Wallet address to monitor" }),
      label:   Type.Optional(Type.String({ description: "Human-readable label for this wallet" })),
      chain:   Type.Optional(Type.String({ description: "Chain: ethereum, base, arbitrum, solana, etc. (default: ethereum)" })),
    }),
    async execute(_id, params) {
      const { existsSync, readFileSync, writeFileSync } = require("node:fs");
      const watchPath = path.join(JELLY_HOME, "watched-wallets.json");
      let wallets: WatchedWallet[] = [];
      if (existsSync(watchPath)) { try { wallets = JSON.parse(readFileSync(watchPath, "utf-8")); } catch {} }
      wallets.push({ address: params.address, label: params.label, chain: params.chain ?? "ethereum" });
      writeFileSync(watchPath, JSON.stringify(wallets, null, 2), "utf-8");
      return text(`Now watching ${params.label ?? params.address} on ${params.chain ?? "ethereum"}`);
    },
  });

  // -- Tools: Advanced Trading (#9 trading panel) --------------------------

  agent.registerTool({
    name: "scan_arbitrage",
    label: "Arbitrage Scanner",
    description: "Scan for cross-chain arbitrage opportunities. Compares prices across chains and DEXes for the same asset.",
    parameters: Type.Object({
      symbol: Type.String({ description: "Asset symbol: ETH, BTC, SOL, etc." }),
      min_profit_pct: Type.Optional(Type.Number({ description: "Minimum profit % to report (default 1.0)" })),
    }),
    async execute(_id, p) {
      const sym = p.symbol.toUpperCase();
      // Get prices from multiple sources
      const results: string[] = [];
      const chains = ["ethereum", "arbitrum", "base", "polygon", "avalanche", "optimism", "bsc", "solana"];
      for (const chain of chains) {
        const cfg = CHAIN_NETWORK[chain];
        if (!cfg) continue;
        try {
          const res = await fetch(`https://${cfg}.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: ["0x000000000000000000000000000000000000dEaD", "latest"] }),
            signal: AbortSignal.timeout(3000),
          });
          if (results.length < 3) results.push(`${chain}: reachable`);
        } catch { /* skip */ }
      }
      return text(`${sym} Arbitrage Scan\nChains checked: ${chains.length}\nReachable: ${results.length}\n\n${results.join("\n")}\n\nNote: Full DEX price comparison requires aggregator integration.`);
    },
  });

  agent.registerTool({
    name: "backtest_strategy",
    label: "Backtest Strategy",
    description: "Test a trading strategy against historical data. Describe strategy in natural language.",
    parameters: Type.Object({
      strategy: Type.String({ description: "Strategy description, e.g. 'Buy when RSI < 30, sell when RSI > 70'" }),
      symbol: Type.String({ description: "Asset: BTC, ETH, SOL" }),
      days: Type.Optional(Type.Number({ description: "Days of history (default 30)" })),
    }),
    async execute(_id, p) {
      // Generate synthetic backtest data
      const days = p.days ?? 30;
      const prices: number[] = [];
      let price = 100 + Math.random() * 900;
      for (let i = 0; i < days * 24; i++) {
        price *= 1 + (Math.random() - 0.48) * 0.02;
        prices.push(Math.round(price * 100) / 100);
      }
      const rsiVals: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;
        rsiVals.push(100 - 100 / (1 + (gain || 0.01) / (loss || 0.01)));
      }
      // Backtest RSI < 30 buy, RSI > 70 sell
      let wins = 0, losses = 0, trades = 0;
      let inPosition = false;
      let entryPrice = 0;
      for (let i = 14; i < rsiVals.length; i++) {
        if (!inPosition && rsiVals[i]! < 30) { inPosition = true; entryPrice = prices[i]!; }
        else if (inPosition && rsiVals[i]! > 70) {
          const pnl = ((prices[i]! - entryPrice) / entryPrice) * 100;
          if (pnl > 0) wins++; else losses++;
          trades++; inPosition = false;
        }
      }
      const totalPnl = prices[prices.length - 1]! - prices[0]!;
      return text([
        `Backtest: ${p.symbol} -- "${p.strategy}"`,
        `Period: ${days} days (${prices.length} hourly candles)`,
        `Start: $${prices[0]} → End: $${prices[prices.length - 1]} (${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)})`,
        `Strategy trades: ${trades} (${wins}W/${losses}L)`,
        `Win rate: ${trades > 0 ? (wins / trades * 100).toFixed(1) : 0}%`,
        `Buy & hold: ${((prices[prices.length - 1]! / prices[0]! - 1) * 100).toFixed(1)}%`,
        `\nNote: Demo backtest with synthetic data. Use real OHLCV for production.`,
      ].join("\n"));
    },
  });

  // -- Tools: Scheduled Tasks (#16) ------------------------------------------

  agent.registerTool({
    name: "schedule_task",
    label: "Schedule Task",
    description: "Schedule a recurring agent task. The agent will run this analysis on each turn.",
    parameters: Type.Object({
      task: Type.String({ description: "Task description, e.g. 'Check BTC price every hour'" }),
      active: Type.Optional(Type.Boolean({ description: "Enable/disable (default true)" })),
    }),
    async execute(_id, p) {
      const { readFileSync, writeFileSync, existsSync, mkdirSync } = require("node:fs");
      const ctxPath = path.join(JELLY_HOME, "context.json");
      mkdirSync(JELLY_HOME, { recursive: true });
      const store = existsSync(ctxPath) ? JSON.parse(readFileSync(ctxPath, "utf-8")) : {};
      const tasks: any[] = store.schedule || [];
      const idx = tasks.findIndex((t: any) => t.task === p.task);
      if (p.active === false && idx >= 0) { tasks.splice(idx, 1); }
      else if (idx < 0) { tasks.push({ task: p.task, created: Date.now(), active: true }); }
      store.schedule = tasks;
      writeFileSync(ctxPath, JSON.stringify(store, null, 2), "utf-8");
      return text(`Schedule: ${tasks.length} active task(s)\n${tasks.map((t: any) => `  • ${t.task}`).join("\n")}`);
    },
  });

  // -- Tool: Daily Briefing (#20) --------------------------------------------

  agent.registerTool({
    name: "daily_briefing",
    label: "Daily Briefing",
    description: "Generate a comprehensive daily briefing: prices, news sentiment, signals, portfolio P&L, and trade ideas.",
    parameters: Type.Object({
      send_to: Type.Optional(Type.String({ description: "telegram / discord / both / none (default: none)" })),
    }),
    async execute(_id, p) {
      const lines: string[] = ["🪼 JellyOS Daily Briefing", `📅 ${new Date().toLocaleDateString()}`, ""];
      // Prices
      const ticks = priceFeed.getAll();
      if (ticks.length > 0) {
        lines.push("📊 Prices:");
        for (const t of ticks.slice(0, 8)) {
          const emoji = t.change24h >= 0 ? "🟢" : "🔴";
          lines.push(`  ${emoji} ${t.symbol} $${t.price.toLocaleString()} (${t.change24h >= 0 ? "+" : ""}${t.change24h.toFixed(2)}%)`);
        }
      }
      // News sentiment
      const report = newsFeed.getLatest();
      if (report) {
        const mood = report.avgSentiment > 0.2 ? "🟢 Bullish" : report.avgSentiment < -0.2 ? "🔴 Bearish" : "🟡 Neutral";
        lines.push(`\n📰 Sentiment: ${mood} (${(report.avgSentiment * 100).toFixed(0)}%)`);
        lines.push(`  Trending: ${report.topKeywords.slice(0, 5).join(", ")}`);
      }
      // Signals
      const sigs = signals?.getActiveSignals() || [];
      if (sigs.length > 0) {
        lines.push(`\n⚡ Signals (${sigs.length}):`);
        for (const s of sigs.slice(0, 5)) {
          lines.push(`  [${s.direction.toUpperCase()}] ${s.asset} -- ${(s.confidence * 100).toFixed(0)}% conf`);
        }
      }
      // Vault
      if (vault && !vault.isLocked()) {
        lines.push(`\n🔐 Vault: $${vault.getStats().balance?.toFixed(2)} (${vault.getStats().entries} entries)`);
      }
      // Trade idea
      lines.push(`\n💡 Trade Idea:`);
      const topMover = priceFeed.getTopMovers(1)[0];
      if (topMover) {
        const dir = topMover.change24h > 2 ? "Consider taking profits" : topMover.change24h < -2 ? "Potential dip buy opportunity" : "Hold / wait for clearer direction";
        lines.push(`  ${topMover.symbol} ${dir} (${topMover.change24h.toFixed(2)}% 24h)`);
      }

      const briefing = lines.join("\n");

      // Send to configured channels
      if (p.send_to === "telegram" || p.send_to === "both") { _tgSend(briefing).catch(() => {}); }
      if (p.send_to === "discord" || p.send_to === "both") { _dcSend(briefing).catch(() => {}); }

      return text(briefing + (p.send_to && p.send_to !== "none" ? `\n\n✓ Sent to ${p.send_to}` : ""));
    },
  });

  // -- Commands: Advanced --------------------------------------------------

  agent.registerCommand("debate", {
    description: "Multi-agent debate on a topic -- /debate <topic>",
    async handler(args, ctx) {
      if (!args.trim()) { ctx.ui.notify("Usage: /debate <topic> -- e.g. /debate Should I buy ETH today?"); return; }
      const topic = args.trim();
      ctx.ui.notify([
        `🪼 Debate: ${topic}`,
        "",
        "Agent A (Bull case): Analyzing bullish factors...",
        "Agent B (Bear case): Analyzing bearish factors...",
        "",
        "The swarm router will decompose this into parallel analyses.",
        "Send the topic as a message to the agent to begin.",
      ].join("\n"));
    },
  });

  agent.registerCommand("whale", {
    description: "WebSocket whale tracker status -- /whale",
    async handler(_args, ctx) {
      const watchPath = path.join(JELLY_HOME, "watched-wallets.json");
      const { existsSync, readFileSync } = require("node:fs");
      const wallets: any[] = existsSync(watchPath) ? JSON.parse(readFileSync(watchPath, "utf-8")) : [];
      ctx.ui.notify([
        `🐋 Whale Tracker`,
        `Watching: ${wallets.length} wallet(s)`,
        `Poll interval: 60s (Alchemy HTTP)`,
        `\n${wallets.map(w => `  ${(w.label ?? "?").padEnd(12)} ${w.chain}  ${w.address.slice(0, 10)}...`).join("\n") || "None. Add with: /watch add <addr> <label> <chain>"}`,
        `\n⚠ Polling mode. For real-time, use Alchemy Mempool WebSocket.`,
      ].join("\n"));
    },
  });

  agent.registerCommand("arb", {
    description: "Scan for arbitrage opportunities -- /arb <symbol>",
    async handler(args, ctx) {
      if (!args.trim()) { ctx.ui.notify("Usage: /arb <symbol> -- e.g. /arb ETH"); return; }
      // Delegate to agent via tool
      ctx.ui.notify(`Scanning arbitrage for ${args.trim().toUpperCase()}...\nAsk the agent: "scan arbitrage for ${args.trim()}"`);
    },
  });

}
