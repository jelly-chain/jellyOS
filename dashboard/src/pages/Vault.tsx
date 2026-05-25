import React from 'react';
import { motion } from 'framer-motion';
import { GlowCard } from '../components/GlowCard';
import { LiveChart } from '../components/LiveChart';

interface VaultProps { stream: any; }

export const Vault: React.FC<VaultProps> = ({ stream }) => {
  const vaultBalance = stream.vaultBalance || 0;
  const vaultEvents = stream.events.filter((e: any) => e.type === 'vault_update').slice(0, 10);

  // Build balance history from vault_update events
  const balanceHistory = vaultEvents.reverse().map((e: any, i: number) => ({
    time: new Date(e.timestamp).toLocaleTimeString(),
    value: e.data?.balance || 0,
  }));
  if (balanceHistory.length === 0) {
    balanceHistory.push({ time: 'now', value: 0 });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: '#FFD700' }}>Profit Vault</h1>
        <div className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#333', color: '#666' }}>
          AES-256-GCM encrypted
        </div>
      </div>

      {/* Balance card */}
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
        <GlowCard accent="#FFD700">
          <div className="p-6 text-center">
            <div className="text-5xl font-bold mb-2 gold-glow" style={{ color: '#FFD700' }}>
              ${vaultBalance.toFixed(2)}
            </div>
            <div className="text-xs mb-4" style={{ color: '#666' }}>Vault Balance (USD)</div>
            {vaultBalance === 0 && (
              <div className="text-xs" style={{ color: '#444' }}>
                Vault may be locked or empty. Use /unlock in the terminal.
              </div>
            )}
            <LiveChart data={balanceHistory} color="#FFD700" height={80} formatValue={v => `$${v.toFixed(2)}`} />
          </div>
        </GlowCard>
      </motion.div>

      {/* Vault events */}
      <GlowCard title="Vault Activity">
        <div className="divide-y" style={{ divideColor: '#111' }}>
          {vaultEvents.length === 0 ? (
            <div className="px-4 py-6 text-xs text-center" style={{ color: '#444' }}>
              No vault activity yet
            </div>
          ) : (
            vaultEvents.map((event: any, i: number) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span style={{ color: '#FFD700' }}>🔐</span>
                  <div>
                    <div className="text-xs" style={{ color: '#aaa' }}>{event.data?.action || 'update'}</div>
                    {event.data?.amount && (
                      <div className="text-xs" style={{ color: '#22c55e' }}>+${event.data.amount?.toFixed(2)}</div>
                    )}
                  </div>
                </div>
                <div className="text-xs" style={{ color: '#444' }}>{new Date(event.timestamp).toLocaleTimeString()}</div>
              </div>
            ))
          )}
        </div>
      </GlowCard>

      {/* Vault commands */}
      <GlowCard title="Terminal Commands" accent="#4a9eff">
        <div className="p-4 space-y-2 font-mono text-xs" style={{ color: '#888' }}>
          {[
            ['/unlock <passphrase>', 'Unlock the vault'],
            ['/lock', 'Lock the vault'],
            ['/vault', 'Show vault balance'],
            ['vault_sweep 500 "daily profits"', 'Sweep $500 to vault'],
            ['vault_history', 'Show transaction history'],
          ].map(([cmd, desc]) => (
            <div key={cmd} className="flex gap-4">
              <span style={{ color: '#FFD700', minWidth: 260 }}>{cmd}</span>
              <span style={{ color: '#555' }}>{desc}</span>
            </div>
          ))}
        </div>
      </GlowCard>
    </div>
  );
};
