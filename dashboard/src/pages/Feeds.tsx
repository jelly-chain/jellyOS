import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlowCard } from '../components/GlowCard';

const CATEGORIES = ['all', 'news', 'signal', 'whale', 'price', 'prediction', 'onchain'];

const CATEGORY_COLORS: Record<string, string> = {
  news: '#4a9eff', signal: '#FFD700', whale: '#a78bfa', price: '#22c55e',
  prediction: '#f97316', onchain: '#06b6d4', social: '#ec4899',
};

const CATEGORY_ICONS: Record<string, string> = {
  news: '📰', signal: '⚡', whale: '🐋', price: '💲',
  prediction: '🎯', onchain: '⛓', social: '💬',
};

interface FeedsProps { stream: any; }

export const Feeds: React.FC<FeedsProps> = ({ stream }) => {
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = stream.recentFeeds.filter((item: any) => {
    if (activeCategory !== 'all' && item.category !== activeCategory) return false;
    if (search && !JSON.stringify(item).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold" style={{ color: '#FFD700' }}>Live Feeds</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: stream.recentFeeds.length > 0 ? '#22c55e' : '#555' }}>
            {stream.recentFeeds.length > 0 ? `● ${stream.recentFeeds.length} items` : '○ No data yet'}
          </span>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className="px-3 py-1 rounded text-xs border transition-all"
            style={{
              borderColor: activeCategory === cat ? (CATEGORY_COLORS[cat] || '#FFD700') : '#222',
              color: activeCategory === cat ? (CATEGORY_COLORS[cat] || '#FFD700') : '#555',
              background: activeCategory === cat ? `${CATEGORY_COLORS[cat] || '#FFD700'}11` : 'transparent',
            }}
          >
            {CATEGORY_ICONS[cat] || '◎'} {cat}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search feeds..."
        className="w-full px-3 py-2 rounded border text-xs bg-transparent outline-none"
        style={{ borderColor: '#222', color: '#aaa' }}
      />

      {/* Feed items */}
      <div className="space-y-2">
        <AnimatePresence>
          {filtered.length === 0 ? (
            <GlowCard>
              <div className="p-8 text-center text-xs" style={{ color: '#444' }}>
                {stream.connected ? 'Waiting for feed data...' : 'Agent offline — start with: jelly'}
                <div className="mt-2 text-xs" style={{ color: '#333' }}>
                  Feeds update every 1–30 minutes depending on source
                </div>
              </div>
            </GlowCard>
          ) : (
            filtered.slice(0, 50).map((item: any, i: number) => {
              const catColor = CATEGORY_COLORS[item.category] || '#666';
              const catIcon = CATEGORY_ICONS[item.category] || '◎';
              return (
                <motion.div
                  key={item.id || i}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <GlowCard accent={catColor}>
                    <div className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span>{catIcon}</span>
                            <span className="text-xs font-bold" style={{ color: catColor }}>{item.source}</span>
                            <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: `${catColor}22`, color: catColor }}>
                              {item.category}
                            </span>
                            {item.sentiment && (
                              <span className="text-xs" style={{
                                color: item.sentiment === 'bullish' ? '#22c55e' : item.sentiment === 'bearish' ? '#ef4444' : '#666'
                              }}>
                                {item.sentiment === 'bullish' ? '↑' : item.sentiment === 'bearish' ? '↓' : '—'}
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-semibold mb-1" style={{ color: '#e0e0e0' }}>{item.title}</div>
                          <div className="text-xs" style={{ color: '#888' }}>{item.content?.slice(0, 200)}</div>
                          {item.url && (
                            <a href={item.url} target="_blank" rel="noopener noreferrer"
                              className="text-xs mt-1 inline-block hover:underline" style={{ color: '#4a9eff' }}>
                              Open ↗
                            </a>
                          )}
                        </div>
                        <div className="text-xs flex-shrink-0" style={{ color: '#444' }}>
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  </GlowCard>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
