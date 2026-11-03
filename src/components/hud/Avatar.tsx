/**
 * Default avatar: an original hooded "shadow hunter" silhouette with glowing eyes.
 * (Original artwork — no Solo Leveling IP.)
 */
export function ShadowSilhouette({ size = 72, color = '#3B9EFF' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id="aura" cx="50%" cy="60%" r="55%">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cloak" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>
        <filter id="eyeglow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="100" height="100" fill="#05070b" />
      <circle cx="50" cy="58" r="48" fill="url(#aura)" />
      {/* cloak + hood */}
      <path d="M50 14 C33 14 26 30 27 44 C27 52 24 58 18 66 C12 75 10 88 10 100 L90 100 C90 88 88 75 82 66 C76 58 73 52 73 44 C74 30 67 14 50 14 Z" fill="url(#cloak)" stroke={color} strokeOpacity="0.5" strokeWidth="1" />
      {/* face shadow */}
      <path d="M50 26 C40 26 35 35 36 45 C37 54 43 60 50 60 C57 60 63 54 64 45 C65 35 60 26 50 26 Z" fill="#000" />
      {/* eyes */}
      <g filter="url(#eyeglow)">
        <path d="M40 43 L47 45 L40 46 Z" fill={color} />
        <path d="M60 43 L53 45 L60 46 Z" fill={color} />
      </g>
      {/* collar line */}
      <path d="M30 74 Q50 86 70 74" fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="1.2" />
    </svg>
  );
}

export function HunterAvatar({ src, size = 72, color }: { src?: string | null; size?: number; color?: string }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-xl border border-cyan-300/40"
      style={{ width: size, height: size, boxShadow: `0 0 18px ${color ?? '#3B9EFF'}55` }}
    >
      {src ? <img src={src} alt="Hunter avatar" className="h-full w-full object-cover" /> : <ShadowSilhouette size={size} color={color} />}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="h-1/3 w-full animate-scan bg-gradient-to-b from-transparent via-cyan-300/10 to-transparent" />
      </div>
    </div>
  );
}
