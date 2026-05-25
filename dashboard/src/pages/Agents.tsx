import React from 'react';
import { motion } from 'framer-motion';
import { GlowCard } from '../components/GlowCard';

const EFFECT_INFO: Record<string, { color: string; desc: string; agents: string }> = {
  eco:    { color: '#22c55e', desc: 'Single model, minimal compute', agents: '0 sub-agents' },
  normal: { color: '#f59e0b', desc: '1 model + optional sub-agent',  agents: '0–1 sub-agents' },
  turbo:  { color: '#f97316', desc: '2 parallel models + sub-agents', agents: '1–2 sub-agents' },
  max:    { color: '#ef4444', desc: 'Full 5-model swarm + reviewer',  agents: '3–5 sub-agents' },
};

interface AgentsPageProps { stream: any; }

export const AgentsPage: React.FC<AgentsPageProps> = ({ stream }) => {
  const activeAgents = stream.activeAgents || 0;
  const swarmEvents = stream.events.filter((e: any) => e.type === 'swarm_update').slice(0, 5);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: '#FFD700' }}>Agents</h1>
        <div className="flex items-center gap-2">
          {activeAgents > 0 ? (
            <motion.div className="flex items-center gap-1.5" animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1, repeat: Infinity }}>
              <span className="w-2 h-2 rounded-full" style={{ background: '#FFD700' }} />
              <span className="text-xs" style={{ color: '#FFD700' }}>{activeAgents} active</span>
            </motion.div>
          ) : (
            <span className="text-xs" style={{ color: '#444' }}>○ No active agents</span>
          )}
        </div>
      </div>

      {/* Effect level cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(EFFECT_INFO).map(([level, info]) => (
          <GlowCard key={level} accent={info.color}>
            <div className="p-4">
              <div className="text-base font-bold mb-1" style={{ color: info.color }}>{level.toUpperCase()}</div>
              <div className="text-xs mb-2" style={{ color: '#666' }}>{info.desc}</div>
              <div className="text-xs px-2 py-1 rounded" style={{ background: `${info.color}11`, color: info.color }}>
                {info.agents}
              </div>
            </div>
          </GlowCard>
        ))}
      </div>

      {/* Swarm activity */}
      <GlowCard title="Swarm Activity">
        <div className="divide-y" style={{ divideColor: '#111' }}>
          {swarmEvents.length === 0 ? (
            <div className="px-4 py-6 text-xs text-center" style={{ color: '#444' }}>
              No swarm events yet
              <div className="mt-1" style={{ color: '#333' }}>Set effect to turbo or max and ask a complex question</div>
            </div>
          ) : (
            swarmEvents.map((event: any, i: number) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between">
                <div className="text-xs" style={{ color: '#aaa' }}>{JSON.stringify(event.data).slice(0, 80)}</div>
                <div className="text-xs" style={{ color: '#444' }}>{new Date(event.timestamp).toLocaleTimeString()}</div>
              </div>
            ))
          )}
        </div>
      </GlowCard>

      {/* How to use */}
      <GlowCard title="How to Use Swarm Mode" accent="#4a9eff">
        <div className="p-4 space-y-3 text-xs" style={{ color: '#888' }}>
          <div>
            <span style={{ color: '#FFD700' }}>1. Set effect level</span>
            <div className="mt-1 font-mono pl-2" style={{ color: '#666' }}>
              /effect turbo    — 2 parallel agents<br />
              /effect max      — 5-agent swarm + reviewer
            </div>
          </div>
          <div>
            <span style={{ color: '#FFD700' }}>2. Ask complex multi-part questions</span>
            <div className="mt-1 font-mono pl-2" style={{ color: '#666' }}>
              "Check BTC price on Binance and ETH price on Coinbase and compare funding rates"
            </div>
          </div>
          <div>
            <span style={{ color: '#FFD700' }}>3. JellyOS automatically splits and synthesizes</span>
            <div className="mt-1 pl-2" style={{ color: '#555' }}>
              Multiple models run in parallel, a reviewer agent reconciles contradictions,
              and you get one unified answer.
            </div>
          </div>
        </div>
      </GlowCard>
    </div>
  );
};
