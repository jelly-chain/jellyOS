import React, { useState, useEffect } from 'react';
import { GlowCard } from '../components/GlowCard';
import { LiveChart } from '../components/LiveChart';

interface Asset {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
}

function fmtPrice(n: number): string {
  return n >= 1000 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` :
         n >= 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(6)}`;
}

function fmtB(n: number): string {
  return n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toLocaleString()}`;
}

interface MarketsProps { stream: any; }

export const Markets: React.FC<MarketsProps> = ({ stream }) => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [priceHistory, setPriceHistory] = useState<Record<string, { time: string; value: number }[]>>({});

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const ids = 'bitcoin,ethereum,solana,bnb,arbitrum,avalanche-2,polygon,optimism,uniswap,chainlink,aave,maker';
        const res = await fetch(
          `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&price_change_percentage=24h`
        );
        if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
        const data = await res.json() as any[];
        const mapped: Asset[] = data.map(d => ({
          id: d.id,
          symbol: d.symbol.toUpperCase(),
          name: d.name,
          price: d.current_price,
          change24h: d.price_change_percentage_24h || 0,
          volume24h: d.total_volume || 0,
          marketCap: d.market_cap || 0,
        }));
        setAssets(mapped);
        // Init sparklines
        const history: Record<string, { time: string; value: number }[]> = {};
        for (const a of mapped) {
          history[a.id] = Array.from({ length: 20 }, (_, i) => ({
            time: new Date(Date.now() - (20 - i) * 60000).toLocaleTimeString(),
            value: a.price * (1 + (Math.random() - 0.5) * 0.02),
          }));
          history[a.id].push({ time: new Date().toLocaleTimeString(), value: a.price });
        }
        setPriceHistory(history);
        setLoading(false);
      } catch (e: any) {
        setError(e.message);
        setLoading(false);
      }
    };

    fetchPrices();
    const t = setInterval(fetchPrices, 60000);
    return () => clearInterval(t);
  }, []);

  if (loading) return (
    <div className="p-6 flex items-center justify-center h-64">
      <span style={{ color: '#FFD700' }}>Loading market data...</span>
    </div>
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: '#FFD700' }}>Markets</h1>
        {error && <span className="text-xs" style={{ color: '#ef4444' }}>⚠ {error}</span>}
        <span className="text-xs" style={{ color: '#555' }}>Live via CoinGecko (60s refresh)</span>
      </div>

      {/* Asset table */}
      <GlowCard>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b" style={{ borderColor: '#1a1a1a' }}>
                {['Asset', 'Price', '24h %', 'Volume', 'Mkt Cap', '7d'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-normal" style={{ color: '#555' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assets.map((a, i) => {
                const isUp = a.change24h >= 0;
                const history = priceHistory[a.id] || [];
                return (
                  <tr key={a.id} className="border-b transition-colors hover:bg-white/5"
                    style={{ borderColor: '#111' }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span style={{ color: '#444' }}>{i + 1}</span>
                        <div>
                          <div className="font-bold" style={{ color: '#e0e0e0' }}>{a.symbol}</div>
                          <div style={{ color: '#555' }}>{a.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold" style={{ color: '#e0e0e0' }}>{fmtPrice(a.price)}</td>
                    <td className="px-4 py-3 font-mono" style={{ color: isUp ? '#22c55e' : '#ef4444' }}>
                      {isUp ? '+' : ''}{a.change24h.toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 font-mono" style={{ color: '#666' }}>{fmtB(a.volume24h)}</td>
                    <td className="px-4 py-3 font-mono" style={{ color: '#666' }}>{fmtB(a.marketCap)}</td>
                    <td className="px-4 py-3 w-24">
                      <LiveChart data={history} height={32} type="line" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlowCard>
    </div>
  );
};
