import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface GlowCardProps {
  children: React.ReactNode;
  title?: string;
  accent?: string;
  className?: string;
  hover?: boolean;
}

export const GlowCard: React.FC<GlowCardProps> = ({
  children,
  title,
  accent = '#FFD700',
  className = '',
  hover = true,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      className={`relative rounded-lg border overflow-hidden ${className}`}
      style={{
        background: '#111111',
        borderColor: isHovered ? accent : '#222222',
        transition: 'border-color 0.3s ease',
      }}
      whileHover={hover ? { scale: 1.005 } : undefined}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      {/* Glow overlay on hover */}
      {isHovered && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            background: `radial-gradient(ellipse at top, ${accent}08 0%, transparent 70%)`,
          }}
        />
      )}

      {title && (
        <div
          className="px-4 py-3 border-b text-xs font-semibold tracking-wider uppercase"
          style={{ borderColor: '#222', color: accent }}
        >
          {title}
        </div>
      )}

      <div className="relative z-10">
        {children}
      </div>
    </motion.div>
  );
};
