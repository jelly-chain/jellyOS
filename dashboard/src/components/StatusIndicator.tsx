import React from 'react';
import { motion } from 'framer-motion';

interface StatusIndicatorProps {
  connected: boolean;
  reconnecting?: boolean;
  label?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ connected, reconnecting, label }) => {
  const color = reconnecting ? '#f59e0b' : connected ? '#22c55e' : '#ef4444';
  const text = reconnecting ? 'Reconnecting...' : connected ? (label || 'Connected') : 'Disconnected';

  return (
    <div className="flex items-center gap-2">
      <motion.div
        className="w-2 h-2 rounded-full"
        style={{ background: color }}
        animate={{ opacity: connected || reconnecting ? [1, 0.4, 1] : 1 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <span className="text-xs" style={{ color }}>{text}</span>
    </div>
  );
};
