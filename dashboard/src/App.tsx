import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboardStream } from './hooks/useDashboardStream';
import { StatusIndicator } from './components/StatusIndicator';
import { Overview } from './pages/Overview';
import { Portfolio } from './pages/Portfolio';
import { Markets } from './pages/Markets';
import { Feeds } from './pages/Feeds';
import { AgentsPage } from './pages/Agents';
import { Vault } from './pages/Vault';
import { Settings } from './pages/Settings';
import { LiveChart } from './components/LiveChart';

/* ─── Chat Panel ─── */
function ChatPanel({ stream, open, onClose }: { stream: any; open: boolean; onClose: () => void }) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const history = stream.dashboardMessages ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [history.length, stream.streamingText]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    stream.sendMessage(text);
    setInput('');
  };

  if (!open) return null;
  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      className="fixed right-0 top-0 bottom-0 w-96 flex flex-col border-l z-50"
      style={{ background: '#0d0d0d', borderColor: '#1a1a1a' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#1a1a1a' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm">🪼</span>
          <span className="text-xs font-bold" style={{ color: '#00e5ff' }}>Agent Chat</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: stream.connected ? '#064e3b' : '#450a0a', color: stream.connected ? '#34d399' : '#f87171' }}>
            {stream.connected ? 'connected' : 'offline'}
          </span>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
      </div>

      {/* Status badges */}
      {stream.agentStatus && (
        <div className="flex gap-2 px-4 py-2 border-b flex-wrap" style={{ borderColor: '#1a1a1a' }}>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#1a1a1a', color: '#888' }}>models: {stream.agentStatus.models}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#1a1a1a', color: '#888' }}>prices: {stream.agentStatus.prices}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#1a1a1a', color: '#888' }}>news: {stream.agentStatus.news}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#1a1a1a', color: '#888' }}>effect: {stream.agentStatus.effect}</span>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex gap-1.5 px-4 py-2 border-b flex-wrap" style={{ borderColor: '#1a1a1a' }}>
        {['Check BTC price', 'Get signals', 'Market overview', 'Scan portfolio'].map(q => (
          <button key={q} onClick={() => { stream.sendMessage(q); }}
            className="text-[10px] px-2 py-1 rounded transition-colors hover:bg-white/10"
            style={{ background: '#1a1a1a', color: '#888' }}>{q}</button>
        ))}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-3 space-y-2">
        {history.length === 0 && !stream.streamingText && (
          <p className="text-[10px] text-center pt-8" style={{ color: '#444' }}>
            Send a message to the agent. The agent will process it on its next turn.
          </p>
        )}
        {history.map((m: any, i: number) => (
          <div key={i} className="flex flex-col gap-0.5">
            <div className="text-[10px] text-right" style={{ color: '#555' }}>{new Date(m.ts).toLocaleTimeString()}</div>
            <div className="text-xs px-3 py-2 rounded-lg self-end max-w-[85%]" style={{ background: '#003344', color: '#b0e0ff' }}>
              {m.text}
            </div>
          </div>
        ))}
        {stream.streamingText && (
          <div className="text-xs px-3 py-2 rounded-lg self-start max-w-[85%] border" style={{ background: '#111', borderColor: '#1a1a1a', color: '#00e5ff' }}>
            {stream.streamingText}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t flex gap-2" style={{ borderColor: '#1a1a1a' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Message the agent..."
          className="flex-1 text-xs px-3 py-2 rounded border outline-none focus:border-cyan-800"
          style={{ background: '#111', borderColor: '#1a1a1a', color: '#ccc' }}
        />
        <button onClick={send} className="text-xs px-4 py-2 rounded font-medium transition-colors"
          style={{ background: '#00e5ff', color: '#000' }}>Send</button>
      </div>
    </motion.div>
  );
}

const NAV_ITEMS = [
  { path: '/', label: 'Overview', icon: '⬡' },
  { path: '/portfolio', label: 'Portfolio', icon: '◈' },
  { path: '/markets', label: 'Markets', icon: '◉' },
  { path: '/feeds', label: 'Live Feeds', icon: '◎' },
  { path: '/agents', label: 'Agents', icon: '⚡' },
  { path: '/vault', label: 'Vault', icon: '🔐' },
  { path: '/settings', label: 'Settings', icon: '⚙' },
];

const EFFECT_LEVELS = ['eco', 'normal', 'turbo', 'max'];
const EFFECT_COLORS: Record<string, string> = { eco: '#22c55e', normal: '#3b82f6', turbo: '#f59e0b', max: '#ef4444' };

const App: React.FC = () => {
  const stream = useDashboardStream();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const currentEffect = stream.agentStatus?.effect ?? 'normal';

  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden" style={{ background: '#0a0a0a', color: '#e0e0e0' }}>
        {/* Sidebar */}
        <motion.aside
          animate={{ width: sidebarOpen ? 200 : 56 }}
          className="flex-shrink-0 flex flex-col border-r overflow-hidden"
          style={{ borderColor: '#1a1a1a', background: '#0d0d0d' }}
        >
          {/* Logo */}
          <div className="flex items-center gap-3 px-4 py-4 border-b" style={{ borderColor: '#1a1a1a' }}>
            <span className="text-xl animate-float" style={{ color: '#FFD700' }}>🐙</span>
            {sidebarOpen && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col">
                <span className="font-bold text-sm gold-glow" style={{ color: '#FFD700' }}>JellyOS</span>
                <span className="text-xs" style={{ color: '#555' }}>v1.0.0</span>
              </motion.div>
            )}
          </div>

          {/* Nav */}
          <nav className="flex-1 py-3">
            {NAV_ITEMS.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md my-0.5 text-xs transition-all ${
                    isActive ? 'bg-yellow-900/20 text-yellow-400' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                  }`
                }
              >
                <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
                {sidebarOpen && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{item.label}</motion.span>}
              </NavLink>
            ))}
          </nav>

          {/* Status */}
          <div className="p-3 border-t" style={{ borderColor: '#1a1a1a' }}>
            {sidebarOpen ? (
              <StatusIndicator connected={stream.connected} reconnecting={stream.reconnecting} label="Agent" />
            ) : (
              <div className="w-2 h-2 rounded-full mx-auto" style={{ background: stream.connected ? '#22c55e' : '#ef4444' }} />
            )}
          </div>

          {/* Toggle */}
          <button
            onClick={() => setSidebarOpen(s => !s)}
            className="p-3 border-t text-center text-xs transition-colors hover:bg-white/5"
            style={{ borderColor: '#1a1a1a', color: '#555' }}
          >
            {sidebarOpen ? '◂' : '▸'}
          </button>
        </motion.aside>

        {/* Main */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar */}
          <header className="flex items-center justify-between px-6 py-3 border-b flex-shrink-0" style={{ borderColor: '#1a1a1a', background: '#0d0d0d' }}>
            <div className="text-xs" style={{ color: '#444' }}>
              {stream.events.length > 0 && (
                <span>Last event: {new Date(stream.events[0]?.timestamp).toLocaleTimeString()}</span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs" style={{ color: '#555' }}>
              <span>agents: <span style={{ color: stream.activeAgents > 0 ? '#FFD700' : '#444' }}>{stream.activeAgents}</span></span>
              <span>vault: <span style={{ color: '#22c55e' }}>${stream.vaultBalance.toFixed(2)}</span></span>
              {/* Effect level selector */}
              <div className="flex items-center gap-1">
                <span style={{ color: '#444' }}>effect:</span>
                {EFFECT_LEVELS.map(lvl => (
                  <button key={lvl} onClick={() => stream.setEffectLevel(lvl)}
                    className="text-[10px] px-1.5 py-0.5 rounded transition-all"
                    style={{
                      background: currentEffect === lvl ? EFFECT_COLORS[lvl] + '33' : 'transparent',
                      color: currentEffect === lvl ? EFFECT_COLORS[lvl] : '#555',
                      border: `1px solid ${currentEffect === lvl ? EFFECT_COLORS[lvl] + '66' : 'transparent'}`,
                    }}>{lvl}</button>
                ))}
              </div>
              <StatusIndicator connected={stream.connected} reconnecting={stream.reconnecting} label="localhost:4320" />
            </div>
          </header>

          {/* Page content */}
          <div className="flex-1 overflow-auto">
            <Routes>
              <Route path="/" element={<Overview stream={stream} />} />
              <Route path="/portfolio" element={<Portfolio stream={stream} />} />
              <Route path="/markets" element={<Markets stream={stream} />} />
              <Route path="/feeds" element={<Feeds stream={stream} />} />
              <Route path="/agents" element={<AgentsPage stream={stream} />} />
              <Route path="/vault" element={<Vault stream={stream} />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </div>
        </main>

        {/* Chat toggle button */}
        {!chatOpen && (
          <button onClick={() => setChatOpen(true)}
            className="fixed bottom-4 right-4 w-12 h-12 rounded-full flex items-center justify-center text-lg shadow-lg z-40 transition-transform hover:scale-110"
            style={{ background: '#00e5ff', color: '#000' }}>🪼</button>
        )}

        <AnimatePresence>
          <ChatPanel stream={stream} open={chatOpen} onClose={() => setChatOpen(false)} />
        </AnimatePresence>
      </div>
    </BrowserRouter>
  );
};

export default App;
