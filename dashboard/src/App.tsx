import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useDashboardStream } from './hooks/useDashboardStream';
import { StatusIndicator } from './components/StatusIndicator';
import { Overview } from './pages/Overview';
import { Portfolio } from './pages/Portfolio';
import { Markets } from './pages/Markets';
import { Feeds } from './pages/Feeds';
import { AgentsPage } from './pages/Agents';
import { Vault } from './pages/Vault';
import { Settings } from './pages/Settings';

const NAV_ITEMS = [
  { path: '/', label: 'Overview', icon: '⬡' },
  { path: '/portfolio', label: 'Portfolio', icon: '◈' },
  { path: '/markets', label: 'Markets', icon: '◉' },
  { path: '/feeds', label: 'Live Feeds', icon: '◎' },
  { path: '/agents', label: 'Agents', icon: '⚡' },
  { path: '/vault', label: 'Vault', icon: '🔐' },
  { path: '/settings', label: 'Settings', icon: '⚙' },
];

const App: React.FC = () => {
  const stream = useDashboardStream();
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
      </div>
    </BrowserRouter>
  );
};

export default App;
