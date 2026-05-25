import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { GlowCard } from '../components/GlowCard';
import { LiveChart } from '../components/LiveChart';

interface DataPoint { time: string; value: number; }

function generateSparkline(base: number, points = 20, volatility = 0.02): DataPoint[] {
  const now = Date.now();
  const result: DataPoint[] = [];
  let val = base;
  for (let i = points; i >= 0; i--) {
    val = val * (1 + (Math.random() - 0.5) * volatility);
    result.push({ time: new Date(now - i * 60000).toLocaleTimeString(), value: parseFloat(val.toFixed(2)) });
  }
  return result;
}

const STAT_CARDS = [
  { label: 'Total Portfolio', key: 'portfolio', prefix: '$', color: '#FFD700', base: 24831 },
  { label: 'P&L Today', key: 'pnl', prefix: '$', color: '#22c55e', base: 312 },
  { label: 'Active Trades', key: 'trades', color: '#4a9eff', base: 3 },
  { label: 'Win Rate', key: 'winrate', suffix: '%', color: '#a78bfa', base: 68 },
];

const CHAIN_BADGES = ['ETH', 'BNB', 'ARB', 'SOL', 'POL', 'AVAX', 'OP', 'BASE'];

interface OverviewProps { stream: any; }

export const Overview: React.FC<OverviewProps> = ({ stream }) => {
  const [charts, setCharts] = useState<Record<string, DataPoint[]>>({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const initial: Record<string, DataPoint[]> = {};
    for (const card of STAT_CARDS) initial[card.key] = generateSparkline(card.base, 20, 0.015);
    setCharts(initial);
    const t = setInterval(() => {
      setTick(n => n + 1);
      setCharts(prev => {
        const next = { ...prev };
        for (const card of STAT_CARDS) {
          const existing = prev[card.key] || [];
          const last = existing[existing.length - 1]?.value || card.base;
          const newVal = last * (1 + (Math.random() - 0.48) * 0.008);
          const newPoint = { time: new Date().toLocaleTimeString(), value: parseFloat(newVal.toFixed(2)) };
          next[card.key] = [...existing.slice(-30), newPoint];
        }
        return next;
      });
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const recentEvents = stream.events.slice(0, 8);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#FFD700' }}>Overview</h1>
          <p className="text-xs mt-1" style={{ color: '#555' }}>Live portfolio and system status</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {CHAIN_BADGES.map(chain => (
            <span key={chain} className="px-2 py-0.5 rounded text-xs border" style={{ borderColor: '#333', color: '#666', background: '#111' }}>
              {chain}
            </span>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((card, i) => {
          const data = charts[card.key] || [];
          const current = data[data.length - 1]?.value || card.base;
          const prev = data[data.length - 2]?.value || card.base;
          const change = prev > 0 ? ((current - prev) / prev * 100).toFixed(2) : '0.00';
          const isUp = parseFloat(change) >= 0;

          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <GlowCard accent={card.color}>
                <div className="p-4">
                  <div className="text-xs mb-1" style={{ color: '#555' }}>{card.label}</div>
                  <div className="text-2xl font-bold mb-1" style={{ color: card.color }}>
                    {card.prefix || ''}{typeof current === 'number' ? current.toLocaleString(undefined, { maximumFractionDigits: 0 }) : current}{card.suffix || ''}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: isUp ? '#22c55e' : '#ef4444' }}>
                      {isUp ? '↑' : '↓'} {Math.abs(parseFloat(change))}%
                    </span>
                  </div>
                  <div className="mt-3">
                    <LiveChart data={data} color={card.color} height={50} />
                  </div>
                </div>
              </GlowCard>
            </motion.div>
          );
        })}
      </div>

      {/* Recent activity + Last trade */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent events */}
        <GlowCard title="Recent Events">
          <div className="divide-y" style={{ divideColor: '#1a1a1a' }}>
            {recentEvents.length === 0 ? (
              <div className="px-4 py-6 text-xs text-center" style={{ color: '#444' }}>
                Waiting for agent events...
                <div className="mt-2" style={{ color: '#333' }}>Start the JellyOS agent to see live data</div>
              </div>
            ) : (
              recentEvents.map((event: any, i: number) => (
                <div key={i} className="px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: '#555' }}>
                      {event.type === 'trade_executed' ? '📈' :
                       event.type === 'vault_update' ? '🔐' :
                       event.type === 'feed_item' ? '📡' : '◎'}
                    </span>
                    <span className="text-xs" style={{ color: '#aaa' }}>{event.type.replace(/_/g, ' ')}</span>
                  </div>
                  <span className="text-xs" style={{ color: '#444' }}>
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </GlowCard>

        {/* Last trade */}
        <GlowCard title="Last Trade">
          {stream.lastTrade ? (
            <div className="p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: '#666' }}>Pair</span>
                <span className="text-xs font-bold" style={{ color: '#FFD700' }}>{stream.lastTrade.pair}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: '#666' }}>Side</span>
                <span className="text-xs" style={{ color: stream.lastTrade.side === 'buy' ? '#22c55e' : '#ef4444' }}>
                  {stream.lastTrade.side?.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: '#666' }}>Amount</span>
                <span className="text-xs" style={{ color: '#aaa' }}>${stream.lastTrade.amount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: '#666' }}>Chain</span>
                <span className="text-xs" style={{ color: '#aaa' }}>{stream.lastTrade.chain}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: '#666' }}>Time</span>
                <span className="text-xs" style={{ color: '#555' }}>{stream.lastTrade.time}</span>
              </div>
            </div>
          ) : (
            <div className="px-4 py-6 text-xs text-center" style={{ color: '#444' }}>
              No trades yet
              <div className="mt-2" style={{ color: '#333' }}>Execute a trade from the REPL to see it here</div>
            </div>
          )}
        </GlowCard>
      </div>

      {/* Log stream */}
      <GlowCard title="Conversation Log">
        <div className="font-mono text-xs p-4 space-y-1 max-h-48 overflow-auto">
          {stream.logEntries.length === 0 ? (
            <div style={{ color: '#333' }}>No conversation yet. Start the agent with: jelly</div>
          ) : (
            stream.logEntries.slice(0, 20).map((entry: any, i: number) => (
              <div key={i} className="flex gap-2">
                <span style={{ color: '#444', flexShrink: 0 }}>{entry.time}</span>
                <span style={{ color: entry.role === 'user' ? '#FFD700' : '#aaa' }}>{entry.role === 'user' ? 'jell>' : '🐙'}</span>
                <span style={{ color: '#666' }} className="truncate">{(entry.content || '').slice(0, 120)}</span>
              </div>
            ))
          )}
        </div>
      </GlowCard>
    </div>
  );
};
