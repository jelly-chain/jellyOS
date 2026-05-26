import React, { useState } from 'react';
import { GlowCard } from '../components/GlowCard';

const MODELS = [
  'anthropic/claude-sonnet-4-20250514',
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'google/gemini-2.5-pro',
  'meta-llama/llama-4-maverick',
  'deepseek/deepseek-chat',
  'mistralai/mistral-large',
  'x-ai/grok-3-mini',
];

const EFFECT_LEVELS = [
  { id: 'eco', label: 'Eco', desc: 'Single model, no sub-agents. Fast, cheap.', color: '#22c55e' },
  { id: 'normal', label: 'Normal', desc: '1 model + 1 sub-agent for complex tasks.', color: '#f59e0b' },
  { id: 'turbo', label: 'Turbo', desc: '2 parallel models + 2 sub-agents.', color: '#f97316' },
  { id: 'max', label: 'Max', desc: '5-model swarm + reviewer. Full intelligence.', color: '#ef4444' },
];

export const Settings: React.FC = () => {
  const [selectedEffect, setSelectedEffect] = useState('normal');
  const [primaryModel, setPrimaryModel] = useState('anthropic/claude-sonnet-4-20250514');
  const [dashPort, setDashPort] = useState('4320');
  const [threshold, setThreshold] = useState('500');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: '#FFD700' }}>Settings</h1>
        <p className="text-xs mt-1" style={{ color: '#555' }}>Configure via .env file — changes here are for reference only</p>
      </div>

      {/* Effect level */}
      <GlowCard title="Effect Level">
        <div className="p-4 grid grid-cols-2 gap-3">
          {EFFECT_LEVELS.map(lvl => (
            <button
              key={lvl.id}
              onClick={() => setSelectedEffect(lvl.id)}
              className="p-3 rounded border text-left transition-all"
              style={{
                borderColor: selectedEffect === lvl.id ? lvl.color : '#222',
                background: selectedEffect === lvl.id ? `${lvl.color}11` : 'transparent',
              }}
            >
              <div className="font-bold text-xs mb-1" style={{ color: lvl.color }}>{lvl.label}</div>
              <div className="text-xs" style={{ color: '#666' }}>{lvl.desc}</div>
            </button>
          ))}
        </div>
        <div className="px-4 pb-4">
          <div className="p-3 rounded text-xs font-mono" style={{ background: '#0d0d0d', color: '#666', border: '1px solid #1a1a1a' }}>
            # In .env:<br />
            JELLY_EFFECT_LEVEL={selectedEffect}
          </div>
        </div>
      </GlowCard>

      {/* Primary model */}
      <GlowCard title="Primary Model">
        <div className="p-4">
          <select
            value={primaryModel}
            onChange={e => setPrimaryModel(e.target.value)}
            className="w-full px-3 py-2 rounded border text-xs bg-transparent outline-none cursor-pointer"
            style={{ borderColor: '#333', color: '#aaa', background: '#111' }}
          >
            {MODELS.map(m => <option key={m} value={m} style={{ background: '#111' }}>{m}</option>)}
          </select>
          <div className="mt-3 p-3 rounded text-xs font-mono" style={{ background: '#0d0d0d', color: '#666', border: '1px solid #1a1a1a' }}>
            JELLY_MODEL_1={primaryModel}
          </div>
        </div>
      </GlowCard>

      {/* Dashboard config */}
      <GlowCard title="Dashboard">
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs block mb-1" style={{ color: '#666' }}>Dashboard Port</label>
            <input
              value={dashPort}
              onChange={e => setDashPort(e.target.value)}
              className="px-3 py-2 rounded border text-xs bg-transparent outline-none w-32"
              style={{ borderColor: '#333', color: '#aaa' }}
            />
          </div>
          <div className="p-3 rounded text-xs font-mono" style={{ background: '#0d0d0d', color: '#666', border: '1px solid #1a1a1a' }}>
            JELLY_DASHBOARD_PORT={dashPort}
          </div>
        </div>
      </GlowCard>

      {/* Auto vault */}
      <GlowCard title="Auto-Vault Threshold">
        <div className="p-4 space-y-3">
          <p className="text-xs" style={{ color: '#666' }}>
            Automatically sweep profits to the encrypted vault when P&L exceeds this amount.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: '#555' }}>$</span>
            <input
              value={threshold}
              onChange={e => setThreshold(e.target.value)}
              type="number"
              className="px-3 py-2 rounded border text-xs bg-transparent outline-none w-32"
              style={{ borderColor: '#333', color: '#aaa' }}
            />
            <span className="text-xs" style={{ color: '#555' }}>USD</span>
          </div>
          <div className="p-3 rounded text-xs font-mono" style={{ background: '#0d0d0d', color: '#666', border: '1px solid #1a1a1a' }}>
            AUTO_VAULT_THRESHOLD={threshold}
          </div>
        </div>
      </GlowCard>

      {/* API Keys reference */}
      <GlowCard title="API Keys (set in .env)" accent="#4a9eff">
        <div className="p-4 space-y-2 font-mono text-xs" style={{ color: '#888' }}>
          {[
            ['OPENROUTER_API_KEY', 'required', 'https://openrouter.ai/keys'],
            ['ALCHEMY_KEY', 'optional', 'https://www.alchemy.com/'],
            ['POLYMARKET_API_KEY', 'optional', 'Prediction markets trading'],
            ['KALSHI_API_KEY', 'optional', 'Kalshi prediction markets'],
            ['COINGLASS_API_KEY', 'optional', 'Detailed funding rates'],
            ['TWITTER_BEARER_TOKEN', 'optional', 'Social sentiment analysis'],
          ].map(([key, req, note]) => (
            <div key={key} className="flex items-center gap-3">
              <span style={{ color: req === 'required' ? '#FFD700' : '#555', minWidth: 240 }}>{key}</span>
              <span className="px-1.5 py-0.5 rounded text-xs" style={{
                background: req === 'required' ? '#FFD70022' : '#11111',
                color: req === 'required' ? '#FFD700' : '#444',
                border: '1px solid #222',
              }}>{req}</span>
              <span style={{ color: '#444' }}>{note}</span>
            </div>
          ))}
        </div>
      </GlowCard>
    </div>
  );
};
