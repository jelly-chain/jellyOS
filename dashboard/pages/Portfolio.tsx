import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { GlowCard } from '../components/GlowCard';
import { LiveChart } from '../components/LiveChart';

const POSITIONS = [
  { symbol: 'ETH', side: 'long', entry: 3420, current: 3891, amount: 2.5, chain: 'ethereum' },
  { symbol: 'SOL', side: 'long', entry: 148, current: 162, amount: 50, chain: 'solana' },
  { symbol: 'BTC', side: 'short', entry: 98500, current: 97100, amount: 0.1, chain: 'bitcoin' },
];

const ALLOCATION = [
  { name: 'ETH', value: 42, color: '#627EEA' },
  { name: 'SOL', value: 28, color: '#9945FF' },
  { name: 'BTC', value: 18, color: '#F7931A' },
  { name: 'Stables', value: 8, color: '#22c55e' },
  { name: 'Other', value: 4, color: '#555' },
];

interface PortfolioProps { stream: any; }

export const Portfolio: React.FC<PortfolioProps> = ({ stream }) => {
  const [pnlHistory] = useState(() =>
    Array.from({ length: 30 }, (_, i) => ({
      time: new Date(Date.now() - (30 - i) * 3600000).toLocaleTimeString(),
      value: 22000 + Math.sin(i / 5) * 1500 + i * 100 + Math.random() * 500,
    }))
  );

  const pnlData = POSITIONS.map(p => {
    const pnl = p.side === 'long'
      ? (p.current - p.entry) * p.amount
      : (p.entry - p.current) * p.amount;
    return { name: p.symbol, pnl: parseFloat(pnl.toFixed(2)), color: pnl >= 0 ? '#22c55e' : '#ef4444' };
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: '#FFD700' }}>Portfolio</h1>
        <span className="text-xs" style={{ color: '#555' }}>Demo data — connect wallet for live</span>
      </div>

      {/* Portfolio value chart */}
      <GlowCard title="Portfolio Value (30d)">
        <div className="p-4">
          <div className="text-2xl font-bold mb-1" style={{ color: '#FFD700' }}>$24,831</div>
          <div className="text-xs mb-4" style={{ color: '#22c55e' }}>↑ +12.4% this month</div>
          <LiveChart data={pnlHistory} color="#FFD700" height={140} formatValue={v => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        </div>
      </GlowCard>

      {/* Allocation + P&L */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie chart */}
        <GlowCard title="Allocation">
          <div className="p-4 flex items-center gap-4">
            <ResponsiveContainer width={150} height={150}>
              <PieChart>
                <Pie data={ALLOCATION} innerRadius={45} outerRadius={70} paddingAngle={2} dataKey="value">
                  {ALLOCATION.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: any, name: string) => [`${v}%`, name]}
                  contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 4, fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {ALLOCATION.map(a => (
                <div key={a.name} className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full" style={{ background: a.color }} />
                  <span style={{ color: '#888' }}>{a.name}</span>
                  <span className="font-bold" style={{ color: a.color }}>{a.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </GlowCard>

        {/* P&L bar */}
        <GlowCard title="Position P&L">
          <div className="p-4">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={pnlData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip
                  formatter={(v: any) => [`$${v.toFixed(2)}`, 'P&L']}
                  contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 4, fontSize: 11 }}
                />
                <Bar dataKey="pnl">
                  {pnlData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlowCard>
      </div>

      {/* Positions table */}
      <GlowCard title="Open Positions">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b" style={{ borderColor: '#1a1a1a' }}>
              {['Asset', 'Side', 'Entry', 'Current', 'Amount', 'P&L', 'Chain'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-normal" style={{ color: '#555' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {POSITIONS.map((pos, i) => {
              const pnl = pos.side === 'long'
                ? (pos.current - pos.entry) * pos.amount
                : (pos.entry - pos.current) * pos.amount;
              const pnlPct = pos.side === 'long'
                ? ((pos.current - pos.entry) / pos.entry * 100)
                : ((pos.entry - pos.current) / pos.entry * 100);
              const isUp = pnl >= 0;
              return (
                <tr key={i} className="border-b hover:bg-white/5 transition-colors" style={{ borderColor: '#111' }}>
                  <td className="px-4 py-3 font-bold" style={{ color: '#e0e0e0' }}>{pos.symbol}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs" style={{
                      background: pos.side === 'long' ? '#22c55e22' : '#ef444422',
                      color: pos.side === 'long' ? '#22c55e' : '#ef4444',
                    }}>{pos.side.toUpperCase()}</span>
                  </td>
                  <td className="px-4 py-3 font-mono" style={{ color: '#666' }}>${pos.entry.toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono" style={{ color: '#e0e0e0' }}>${pos.current.toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono" style={{ color: '#888' }}>{pos.amount}</td>
                  <td className="px-4 py-3 font-mono font-bold" style={{ color: isUp ? '#22c55e' : '#ef4444' }}>
                    {isUp ? '+' : ''}${pnl.toFixed(2)}<br />
                    <span className="font-normal text-xs">{isUp ? '+' : ''}{pnlPct.toFixed(1)}%</span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: '#555' }}>{pos.chain}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </GlowCard>
    </div>
  );
};
