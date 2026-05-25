import { Logger } from '../core/utils/Logger';

export interface FeedItem {
  id: string;
  source: string;
  title: string;
  content: string;
  url?: string;
  timestamp: number;
  category: 'news' | 'signal' | 'whale' | 'price' | 'social' | 'onchain' | 'prediction';
  metadata?: Record<string, any>;
  sentiment?: 'bullish' | 'bearish' | 'neutral';
  priority?: 'high' | 'medium' | 'low';
}

export interface FeedSource {
  name: string;
  interval: number;
  enabled: boolean;
  fetch: () => Promise<FeedItem[]>;
}

export class FeedManager {
  private logger: Logger;
  private items: FeedItem[] = [];
  private sources: Map<string, FeedSource> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private listeners: Set<(item: FeedItem) => void> = new Set();
  private maxItems = 500;
  private running = false;

  constructor() {
    this.logger = new Logger('FeedManager');
    this.registerBuiltinSources();
  }

  private registerBuiltinSources(): void {
    // CoinGecko price feed
    this.register({
      name: 'coingecko_prices',
      interval: 60_000,
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,bnb&vs_currencies=usd&include_24hr_change=true',
            { signal: AbortSignal.timeout(8000) }
          );
          if (!res.ok) return [];
          const data = await res.json() as any;
          return Object.entries(data).map(([id, info]: [string, any]) => ({
            id: `price-${id}-${Date.now()}`,
            source: 'coingecko',
            title: `${id.toUpperCase()} Price Update`,
            content: `$${info.usd.toLocaleString()} (${info.usd_24h_change?.toFixed(2)}% 24h)`,
            timestamp: Date.now(),
            category: 'price' as const,
            metadata: { price: info.usd, change24h: info.usd_24h_change, asset: id },
            sentiment: (info.usd_24h_change ?? 0) > 0 ? 'bullish' : 'bearish',
          }));
        } catch { return []; }
      },
    });

    // Alternative.me Fear & Greed Index
    this.register({
      name: 'fear_greed',
      interval: 3_600_000, // hourly
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch('https://api.alternative.me/fng/?limit=1', { signal: AbortSignal.timeout(5000) });
          if (!res.ok) return [];
          const data = await res.json() as any;
          const item = data?.data?.[0];
          if (!item) return [];
          const val = parseInt(item.value);
          return [{
            id: `fng-${Date.now()}`,
            source: 'alternative.me',
            title: `Fear & Greed Index: ${item.value_classification}`,
            content: `Score: ${item.value}/100 (${item.value_classification})`,
            timestamp: Date.now(),
            category: 'signal',
            metadata: { score: val, classification: item.value_classification },
            sentiment: val > 60 ? 'bullish' : val < 40 ? 'bearish' : 'neutral',
            priority: val < 25 || val > 75 ? 'high' : 'medium',
          }];
        } catch { return []; }
      },
    });

    // CryptoCompare News
    this.register({
      name: 'crypto_news',
      interval: 300_000, // 5 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch(
            'https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest&limit=5',
            { signal: AbortSignal.timeout(8000) }
          );
          if (!res.ok) return [];
          const data = await res.json() as any;
          return (data?.Data || []).slice(0, 5).map((item: any) => ({
            id: `news-${item.id}`,
            source: item.source || 'cryptocompare',
            title: item.title || '',
            content: (item.body || '').slice(0, 300),
            url: item.url,
            timestamp: (item.published_on || 0) * 1000,
            category: 'news' as const,
            metadata: { tags: item.tags, categories: item.categories },
            sentiment: 'neutral' as const,
          }));
        } catch { return []; }
      },
    });

    // Polymarket trending markets
    this.register({
      name: 'polymarket_trends',
      interval: 600_000, // 10 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch(
            'https://gamma-api.polymarket.com/markets?limit=5&order=volume&ascending=false&active=true',
            { signal: AbortSignal.timeout(8000) }
          );
          if (!res.ok) return [];
          const data = await res.json() as any;
          return (Array.isArray(data) ? data : []).slice(0, 5).map((mkt: any) => ({
            id: `poly-${mkt.id}`,
            source: 'polymarket',
            title: mkt.question || '',
            content: `Volume: $${(mkt.volume || 0).toLocaleString()} | Yes: ${(mkt.outcomePrices?.[0] * 100 || 0).toFixed(0)}%`,
            url: `https://polymarket.com/event/${mkt.slug}`,
            timestamp: Date.now(),
            category: 'prediction' as const,
            metadata: { volume: mkt.volume, yesPrice: mkt.outcomePrices?.[0] },
            sentiment: 'neutral' as const,
          }));
        } catch { return []; }
      },
    });

    // On-chain large transfers (simulated from mempool)
    this.register({
      name: 'whale_watch',
      interval: 120_000, // 2 min
      enabled: !!process.env.ALCHEMY_KEY,
      fetch: async () => {
        if (!process.env.ALCHEMY_KEY) return [];
        try {
          // Check recent large ETH transfers
          const res = await fetch(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0', id: 1, method: 'alchemy_getAssetTransfers',
              params: [{ category: ['external'], maxCount: '0x5', order: 'desc',
                withMetadata: true, excludeZeroValue: true,
                fromBlock: 'latest', toBlock: 'latest' }],
            }),
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return [];
          const data = await res.json() as any;
          return (data?.result?.transfers || [])
            .filter((t: any) => parseFloat(t.value || '0') > 100)
            .slice(0, 3)
            .map((t: any) => ({
              id: `whale-${t.hash}`,
              source: 'alchemy-onchain',
              title: `Whale Transfer: ${parseFloat(t.value).toFixed(2)} ETH`,
              content: `From: ${t.from?.slice(0, 8)}... To: ${t.to?.slice(0, 8)}... — ${parseFloat(t.value).toFixed(4)} ETH`,
              url: `https://etherscan.io/tx/${t.hash}`,
              timestamp: Date.now(),
              category: 'whale' as const,
              metadata: { from: t.from, to: t.to, value: t.value, hash: t.hash },
              priority: parseFloat(t.value) > 1000 ? 'high' : 'medium',
            }));
        } catch { return []; }
      },
    });

    // DeFiLlama TVL summary
    this.register({
      name: 'defillama_tvl',
      interval: 1_800_000, // 30 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch('https://api.llama.fi/v2/chains', { signal: AbortSignal.timeout(8000) });
          if (!res.ok) return [];
          const data = await res.json() as any;
          const top = (Array.isArray(data) ? data : [])
            .sort((a: any, b: any) => (b.tvl || 0) - (a.tvl || 0))
            .slice(0, 5);
          if (top.length === 0) return [];
          const summary = top.map((c: any) => `${c.name}: $${((c.tvl || 0) / 1e9).toFixed(2)}B`).join(' | ');
          return [{
            id: `tvl-${Date.now()}`,
            source: 'defillama',
            title: 'Top Chain TVL Update',
            content: summary,
            timestamp: Date.now(),
            category: 'onchain',
            metadata: { chains: top },
            sentiment: 'neutral',
          }];
        } catch { return []; }
      },
    });

    // Coinglass funding rates
    this.register({
      name: 'funding_rates',
      interval: 900_000, // 15 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch(
            'https://open-api.coinglass.com/public/v2/funding?symbol=BTC',
            { signal: AbortSignal.timeout(8000) }
          );
          if (!res.ok) return [];
          const data = await res.json() as any;
          if (!data?.data) return [];
          const rates = (Array.isArray(data.data) ? data.data : []).slice(0, 5);
          const summary = rates.map((r: any) => `${r.exchangeName}: ${(r.fundingRate * 100).toFixed(4)}%`).join(' | ');
          return [{
            id: `funding-${Date.now()}`,
            source: 'coinglass',
            title: 'BTC Funding Rates',
            content: summary || 'No funding data',
            timestamp: Date.now(),
            category: 'signal',
            metadata: { rates },
            sentiment: rates.some((r: any) => r.fundingRate > 0.0005) ? 'bearish' : 'neutral',
          }];
        } catch { return []; }
      },
    });

    // ── Additional sources (sources 8–21) ────────────────────────────────

    // 8. Binance 24-hr ticker (top 10 USDT pairs by volume)
    this.register({
      name: 'binance_tickers',
      interval: 120_000,
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch('https://api.binance.com/api/v3/ticker/24hr', { signal: AbortSignal.timeout(8000) });
          if (!res.ok) return [];
          const data = await res.json() as any;
          const top = (Array.isArray(data) ? data : [])
            .filter((t: any) => t.symbol.endsWith('USDT'))
            .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
            .slice(0, 8);
          return top.map((t: any) => ({
            id: `binance-${t.symbol}-${Date.now()}`,
            source: 'binance',
            title: `${t.symbol} 24h: ${parseFloat(t.priceChangePercent).toFixed(2)}%`,
            content: `Price: $${parseFloat(t.lastPrice).toLocaleString()} | Volume: $${(parseFloat(t.quoteVolume) / 1e6).toFixed(1)}M | High: $${parseFloat(t.highPrice).toLocaleString()}`,
            timestamp: Date.now(),
            category: 'price' as const,
            metadata: { symbol: t.symbol, price: t.lastPrice, change: t.priceChangePercent, volume: t.quoteVolume },
            sentiment: parseFloat(t.priceChangePercent) > 0 ? 'bullish' : 'bearish',
          }));
        } catch { return []; }
      },
    });

    // 9. CoinGecko trending coins
    this.register({
      name: 'coingecko_trending',
      interval: 1_800_000, // 30 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch('https://api.coingecko.com/api/v3/search/trending', { signal: AbortSignal.timeout(8000) });
          if (!res.ok) return [];
          const data = await res.json() as any;
          return (data?.coins || []).slice(0, 7).map((c: any) => ({
            id: `trending-${c.item.id}-${Date.now()}`,
            source: 'coingecko-trending',
            title: `Trending: ${c.item.name} (${c.item.symbol})`,
            content: `Rank #${c.item.market_cap_rank ?? '?'} | Score: ${c.item.score ?? 0}`,
            timestamp: Date.now(),
            category: 'social' as const,
            metadata: { coin: c.item, rank: c.item.score },
            sentiment: 'bullish' as const,
            priority: 'medium' as const,
          }));
        } catch { return []; }
      },
    });

    // 10. DeFiLlama protocol gainers/losers (TVL change)
    this.register({
      name: 'defillama_protocols',
      interval: 3_600_000,
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch('https://api.llama.fi/protocols', { signal: AbortSignal.timeout(8000) });
          if (!res.ok) return [];
          const data = await res.json() as any;
          const protos = (Array.isArray(data) ? data : [])
            .filter((p: any) => p.tvl > 1_000_000 && p.change_1d !== null)
            .sort((a: any, b: any) => Math.abs(b.change_1d ?? 0) - Math.abs(a.change_1d ?? 0))
            .slice(0, 6);
          return protos.map((p: any) => ({
            id: `proto-${p.slug}-${Date.now()}`,
            source: 'defillama-protocols',
            title: `${p.name} TVL ${p.change_1d > 0 ? '+' : ''}${(p.change_1d ?? 0).toFixed(2)}%`,
            content: `TVL: $${((p.tvl || 0) / 1e6).toFixed(1)}M | Chain: ${p.chain || 'multi'} | Category: ${p.category || '?'}`,
            timestamp: Date.now(),
            category: 'onchain' as const,
            metadata: { protocol: p.name, tvl: p.tvl, change1d: p.change_1d },
            sentiment: (p.change_1d ?? 0) > 3 ? 'bullish' : (p.change_1d ?? 0) < -3 ? 'bearish' : 'neutral',
          }));
        } catch { return []; }
      },
    });

    // 11. Global crypto market cap snapshot (CoinGecko global)
    this.register({
      name: 'market_global',
      interval: 3_600_000,
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch('https://api.coingecko.com/api/v3/global', { signal: AbortSignal.timeout(8000) });
          if (!res.ok) return [];
          const d = (await res.json() as any)?.data;
          if (!d) return [];
          return [{
            id: `global-${Date.now()}`,
            source: 'coingecko-global',
            title: `Global Market Cap: $${((d.total_market_cap?.usd || 0) / 1e12).toFixed(2)}T`,
            content: `BTC dominance: ${(d.market_cap_percentage?.btc || 0).toFixed(1)}% | ETH: ${(d.market_cap_percentage?.eth || 0).toFixed(1)}% | 24h change: ${(d.market_cap_change_percentage_24h_usd || 0).toFixed(2)}%`,
            timestamp: Date.now(),
            category: 'signal' as const,
            metadata: { marketCap: d.total_market_cap?.usd, btcDom: d.market_cap_percentage?.btc, change24h: d.market_cap_change_percentage_24h_usd },
            sentiment: (d.market_cap_change_percentage_24h_usd || 0) > 0 ? 'bullish' : 'bearish',
          }];
        } catch { return []; }
      },
    });

    // 12. Messari news headlines (free RSS feed)
    this.register({
      name: 'messari_rss',
      interval: 600_000, // 10 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch('https://messari.io/rss/news.xml', { signal: AbortSignal.timeout(8000) });
          if (!res.ok) return [];
          const text = await res.text();
          const items = [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5);
          return items.map((m, i) => {
            const title = m[1]?.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] ?? m[1]?.match(/<title>(.*?)<\/title>/)?.[1] ?? '';
            const link  = m[1]?.match(/<link>(.*?)<\/link>/)?.[1] ?? '';
            return {
              id: `messari-${i}-${Date.now()}`,
              source: 'messari',
              title: title.trim(),
              content: title.trim(),
              url: link.trim(),
              timestamp: Date.now(),
              category: 'news' as const,
              metadata: {},
              sentiment: 'neutral' as const,
            };
          }).filter(it => it.title);
        } catch { return []; }
      },
    });

    // 13. CoinTelegraph news RSS
    this.register({
      name: 'cointelegraph_rss',
      interval: 600_000,
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch('https://cointelegraph.com/rss', { signal: AbortSignal.timeout(8000) });
          if (!res.ok) return [];
          const t = await res.text();
          const items = [...t.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5);
          return items.map((m, i) => {
            const title = m[1]?.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] ?? m[1]?.match(/<title>(.*?)<\/title>/)?.[1] ?? '';
            const link  = m[1]?.match(/<link>(.*?)<\/link>/)?.[1] ?? '';
            return {
              id: `ct-${i}-${Date.now()}`,
              source: 'cointelegraph',
              title: title.trim(),
              content: title.trim(),
              url: link.trim(),
              timestamp: Date.now(),
              category: 'news' as const,
              metadata: {},
              sentiment: 'neutral' as const,
            };
          }).filter(it => it.title);
        } catch { return []; }
      },
    });

    // 14. Open-interest aggregate from CoinGlass
    this.register({
      name: 'open_interest',
      interval: 900_000, // 15 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch('https://open-api.coinglass.com/public/v2/open_interest?symbol=BTC', { signal: AbortSignal.timeout(8000) });
          if (!res.ok) return [];
          const data = await res.json() as any;
          if (!data?.data) return [];
          const oi = (Array.isArray(data.data) ? data.data : []).slice(0, 5);
          const total = oi.reduce((sum: number, ex: any) => sum + (ex.openInterest || 0), 0);
          const detail = oi.map((ex: any) => `${ex.exchangeName}: $${((ex.openInterest || 0) / 1e9).toFixed(2)}B`).join(' | ');
          return [{
            id: `oi-${Date.now()}`,
            source: 'coinglass-oi',
            title: `BTC Open Interest: $${(total / 1e9).toFixed(2)}B`,
            content: detail || 'No OI data',
            timestamp: Date.now(),
            category: 'signal' as const,
            metadata: { total, exchanges: oi },
            sentiment: 'neutral' as const,
          }];
        } catch { return []; }
      },
    });

    // 15. Gas tracker — Ethereum base fee (eth_gasPrice)
    this.register({
      name: 'eth_gas',
      interval: 60_000,
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch('https://api.etherscan.io/api?module=gastracker&action=gasoracle', { signal: AbortSignal.timeout(5000) });
          if (!res.ok) return [];
          const data = await res.json() as any;
          const r = data?.result;
          if (!r) return [];
          return [{
            id: `gas-${Date.now()}`,
            source: 'etherscan-gas',
            title: `ETH Gas: Safe ${r.SafeGasPrice} | Propose ${r.ProposeGasPrice} | Fast ${r.FastGasPrice} Gwei`,
            content: `Safe: ${r.SafeGasPrice} gwei | Standard: ${r.ProposeGasPrice} gwei | Fast: ${r.FastGasPrice} gwei | Base: ${r.suggestBaseFee} gwei`,
            timestamp: Date.now(),
            category: 'onchain' as const,
            metadata: { safe: r.SafeGasPrice, standard: r.ProposeGasPrice, fast: r.FastGasPrice, base: r.suggestBaseFee },
            sentiment: parseFloat(r.FastGasPrice) > 100 ? 'bearish' : 'neutral',
            priority: parseFloat(r.FastGasPrice) > 200 ? 'high' : 'low',
          }];
        } catch { return []; }
      },
    });

    // 16. Crypto Reddit sentiment (top posts r/CryptoCurrency)
    this.register({
      name: 'reddit_sentiment',
      interval: 1_800_000, // 30 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch('https://www.reddit.com/r/CryptoCurrency/hot.json?limit=10', {
            headers: { 'User-Agent': 'JellyOS/1.0' },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return [];
          const data = await res.json() as any;
          const posts = data?.data?.children?.slice(0, 5) ?? [];
          return posts.map((p: any) => ({
            id: `reddit-${p.data.id}`,
            source: 'reddit-r/cryptocurrency',
            title: p.data.title?.slice(0, 120) ?? '',
            content: `Score: ${p.data.score} | Comments: ${p.data.num_comments} | Upvote: ${(p.data.upvote_ratio * 100).toFixed(0)}%`,
            url: `https://reddit.com${p.data.permalink}`,
            timestamp: (p.data.created_utc || 0) * 1000,
            category: 'social' as const,
            metadata: { score: p.data.score, comments: p.data.num_comments },
            sentiment: p.data.upvote_ratio > 0.85 ? 'bullish' : 'neutral',
          })).filter((it: any) => it.title);
        } catch { return []; }
      },
    });

    // 17. Solana network stats (via public RPC)
    this.register({
      name: 'solana_stats',
      interval: 300_000, // 5 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch('https://api.mainnet-beta.solana.com', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getRecentPerformanceSamples', params: [1] }),
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return [];
          const data = await res.json() as any;
          const sample = data?.result?.[0];
          if (!sample) return [];
          const tps = Math.round(sample.numTransactions / sample.samplePeriodSecs);
          return [{
            id: `sol-stats-${Date.now()}`,
            source: 'solana-rpc',
            title: `Solana TPS: ${tps.toLocaleString()}`,
            content: `Transactions per second: ${tps} | Slot: ${sample.slot}`,
            timestamp: Date.now(),
            category: 'onchain' as const,
            metadata: { tps, slot: sample.slot },
            sentiment: tps > 2000 ? 'bullish' : 'neutral',
          }];
        } catch { return []; }
      },
    });

    // 18. BTC mempool congestion (mempool.space)
    this.register({
      name: 'btc_mempool',
      interval: 180_000, // 3 min
      enabled: true,
      fetch: async () => {
        try {
          const [statsRes, feesRes] = await Promise.all([
            fetch('https://mempool.space/api/mempool', { signal: AbortSignal.timeout(6000) }),
            fetch('https://mempool.space/api/v1/fees/recommended', { signal: AbortSignal.timeout(6000) }),
          ]);
          if (!statsRes.ok || !feesRes.ok) return [];
          const stats = await statsRes.json() as any;
          const fees  = await feesRes.json() as any;
          return [{
            id: `btc-mempool-${Date.now()}`,
            source: 'mempool.space',
            title: `BTC Mempool: ${(stats.count || 0).toLocaleString()} txs | Fast: ${fees.fastestFee} sat/vB`,
            content: `Pending: ${stats.count} txs (${((stats.vsize || 0) / 1e6).toFixed(1)} MvB) | Fees: low ${fees.hourFee} / mid ${fees.halfHourFee} / fast ${fees.fastestFee} sat/vB`,
            timestamp: Date.now(),
            category: 'onchain' as const,
            metadata: { count: stats.count, vsize: stats.vsize, fees },
            sentiment: fees.fastestFee > 100 ? 'bearish' : 'neutral',
            priority: fees.fastestFee > 200 ? 'high' : 'low',
          }];
        } catch { return []; }
      },
    });

    // 19. Dune Analytics (public parameterless queries — whale wallet tracker)
    this.register({
      name: 'dune_whales',
      interval: 3_600_000, // 1 hr
      enabled: !!process.env.DUNE_API_KEY,
      fetch: async () => {
        if (!process.env.DUNE_API_KEY) return [];
        try {
          const queryId = 3344990; // public whale tracker query
          const res = await fetch(`https://api.dune.com/api/v1/query/${queryId}/results?limit=5`, {
            headers: { 'X-DUNE-API-KEY': process.env.DUNE_API_KEY },
            signal: AbortSignal.timeout(15_000),
          });
          if (!res.ok) return [];
          const data = await res.json() as any;
          const rows = data?.result?.rows ?? [];
          return rows.slice(0, 5).map((r: any, i: number) => ({
            id: `dune-whale-${i}-${Date.now()}`,
            source: 'dune-analytics',
            title: `Whale: ${(r.wallet ?? '?').slice(0, 10)}… moved $${((r.usd_value ?? 0) / 1e6).toFixed(1)}M`,
            content: JSON.stringify(r).slice(0, 200),
            timestamp: Date.now(),
            category: 'whale' as const,
            metadata: r,
            priority: 'high' as const,
          }));
        } catch { return []; }
      },
    });

    // 20. Glassnode on-chain metrics (free tier — SOPR, active addresses)
    this.register({
      name: 'glassnode_onchain',
      interval: 3_600_000,
      enabled: !!process.env.GLASSNODE_API_KEY,
      fetch: async () => {
        if (!process.env.GLASSNODE_API_KEY) return [];
        try {
          const key = process.env.GLASSNODE_API_KEY;
          const res = await fetch(
            `https://api.glassnode.com/v1/metrics/addresses/active_count?a=BTC&api_key=${key}&i=24h&limit=1`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (!res.ok) return [];
          const data = await res.json() as any;
          const latest = Array.isArray(data) ? data[data.length - 1] : null;
          if (!latest) return [];
          return [{
            id: `glassnode-${Date.now()}`,
            source: 'glassnode',
            title: `BTC Active Addresses: ${(latest.v ?? 0).toLocaleString()}`,
            content: `Active BTC addresses (24h): ${(latest.v ?? 0).toLocaleString()} | As of: ${new Date((latest.t ?? 0) * 1000).toISOString().slice(0, 10)}`,
            timestamp: Date.now(),
            category: 'onchain' as const,
            metadata: { count: latest.v },
            sentiment: (latest.v ?? 0) > 900_000 ? 'bullish' : 'neutral',
          }];
        } catch { return []; }
      },
    });

    // 21. CryptoCompare social stats (BTC GitHub activity)
    this.register({
      name: 'crypto_social',
      interval: 7_200_000, // 2 hr
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch(
            'https://min-api.cryptocompare.com/data/social/coin/latest?coinId=1182', // BTC
            { signal: AbortSignal.timeout(8000) }
          );
          if (!res.ok) return [];
          const d = (await res.json() as any)?.Data;
          if (!d) return [];
          const tw = d.Twitter ?? {};
          const rd = d.Reddit ?? {};
          return [{
            id: `social-${Date.now()}`,
            source: 'cryptocompare-social',
            title: `BTC Social: Twitter ${tw.followers?.toLocaleString() ?? '?'} followers | Reddit ${rd.subscribers?.toLocaleString() ?? '?'} subs`,
            content: `Twitter: ${tw.followers ?? '?'} followers, ${tw.statuses_count ?? '?'} posts | Reddit: ${rd.subscribers ?? '?'} subs, ${rd.active_users ?? '?'} active`,
            timestamp: Date.now(),
            category: 'social' as const,
            metadata: { twitter: tw, reddit: rd },
            sentiment: 'neutral' as const,
          }];
        } catch { return []; }
      },
    });
  }

  register(source: FeedSource): void {
    this.sources.set(source.name, source);
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    for (const [name, source] of this.sources) {
      if (!source.enabled) continue;
      // Initial fetch after a short delay
      const delay = Math.random() * 5000;
      setTimeout(() => this.runSource(name, source), delay);

      const timer = setInterval(() => this.runSource(name, source), source.interval);
      this.timers.set(name, timer);
    }

    this.logger.info(`FeedManager started with ${this.sources.size} sources`);
  }

  private async runSource(name: string, source: FeedSource): Promise<void> {
    try {
      const items = await source.fetch();
      for (const item of items) {
        const exists = this.items.some(i => i.id === item.id);
        if (!exists) {
          this.items.unshift(item);
          if (this.items.length > this.maxItems) this.items = this.items.slice(0, this.maxItems);
          for (const listener of this.listeners) {
            try { listener(item); } catch { /* ignore */ }
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Feed ${name} failed: ${err.message}`);
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
    this.running = false;
  }

  subscribe(listener: (item: FeedItem) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getRecent(options: { category?: string; limit?: number; source?: string } = {}): FeedItem[] {
    let result = this.items;
    if (options.category) result = result.filter(i => i.category === options.category);
    if (options.source) result = result.filter(i => i.source === options.source);
    return result.slice(0, options.limit || 20);
  }

  getStats(): any {
    const bySource: Record<string, number> = {};
    for (const item of this.items) {
      bySource[item.source] = (bySource[item.source] || 0) + 1;
    }
    return {
      totalItems: this.items.length,
      activeSources: Array.from(this.timers.keys()).length,
      bySource,
      running: this.running,
    };
  }

  getSources(): string[] { return Array.from(this.sources.keys()); }
}
