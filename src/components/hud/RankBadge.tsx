import { motion } from 'framer-motion';
import type { RankBand } from '../../domain/leveling';

/** Hexagonal rank badge with an animated glow ring. S-Rank gets a golden pulse. */
export function RankBadge({ rank, size = 64 }: { rank: RankBand; size?: number }) {
  const isS = rank.id === 'S';
  return (
    <motion.div
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      animate={{ filter: [`drop-shadow(0 0 4px ${rank.color}88)`, `drop-shadow(0 0 ${isS ? 16 : 10}px ${rank.color})`, `drop-shadow(0 0 4px ${rank.color}88)`] }}
      transition={{ duration: isS ? 1.8 : 3, repeat: Infinity, ease: 'easeInOut' }}
      title={rank.label}
      aria-label={`Hunter Rank ${rank.label}`}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} className="absolute inset-0">
        <defs>
          <linearGradient id={`rg-${rank.id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={rank.color} stopOpacity="0.35" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <polygon points="50,4 92,27 92,73 50,96 8,73 8,27" fill={`url(#rg-${rank.id})`} stroke={rank.color} strokeWidth="3" />
        <polygon points="50,14 83,32 83,68 50,86 17,68 17,32" fill="none" stroke={rank.color} strokeOpacity="0.4" strokeWidth="1.2" />
      </svg>
      <span className="relative font-display font-black" style={{ color: rank.color, fontSize: size * 0.42, textShadow: `0 0 10px ${rank.color}` }}>
        {rank.id}
      </span>
    </motion.div>
  );
}
