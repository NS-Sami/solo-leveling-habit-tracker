/**
 * "The System" immersion layer, all rendered as System windows:
 *   NOTIFICATION toasts · LEVEL UP message · red EMERGENCY QUEST window · floating mana motes.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { Bed } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useUI } from '../../state/ui';
import { useSystem } from '../../state/SystemProvider';
import { setRestDay } from '../../data/actions';
import { sfx } from '../../lib/sfx';

const TONES = {
  system: { border: 'rgba(140,200,255,.8)', glow: 'rgba(59,158,255,.55)', text: '#ffffff' },
  gold: { border: 'rgba(251,191,36,.85)', glow: 'rgba(251,191,36,.5)', text: '#FDE68A' },
  crimson: { border: 'rgba(248,113,113,.85)', glow: 'rgba(239,68,68,.55)', text: '#FECACA' },
  success: { border: 'rgba(140,200,255,.8)', glow: 'rgba(59,158,255,.55)', text: '#ffffff' },
};

/** Small NOTIFICATION windows stacked at the top. */
export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex flex-col items-center gap-2 px-4 sm:left-auto sm:right-4 sm:items-end" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => {
          const tone = TONES[t.tone ?? 'system'];
          return (
            <motion.button
              key={t.id}
              layout
              onClick={() => dismiss(t.id)}
              initial={{ opacity: 0, scaleY: 0.2, filter: 'brightness(2.5)' }}
              animate={{ opacity: 1, scaleY: 1, filter: 'brightness(1)' }}
              exit={{ opacity: 0, scaleY: 0.2 }}
              transition={{ duration: 0.25 }}
              className="pointer-events-auto w-full max-w-sm rounded-[5px] border bg-[#050d1f]/95 px-4 py-2.5 text-center backdrop-blur"
              style={{ borderColor: tone.border, boxShadow: `0 0 18px ${tone.glow}, inset 0 0 14px ${tone.glow}` }}
            >
              <div className="mb-1.5 flex items-center justify-center gap-2">
                <span className="sys-icon h-5 w-5 text-[11px]" aria-hidden>
                  !
                </span>
                <span className="font-display text-[10px] font-bold tracking-[0.35em] text-white">NOTIFICATION</span>
              </div>
              <div className="font-display text-[14px] font-semibold" style={{ color: tone.text, textShadow: `0 0 10px ${tone.glow}` }}>
                {t.title}
              </div>
              {t.body && <div className="mt-0.5 truncate font-mono text-[11px] text-slate-300">{t.body}</div>}
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function Particles({ color }: { color: string }) {
  const parts = useMemo(
    () =>
      Array.from({ length: 50 }, (_, i) => {
        const a = (i / 50) * Math.PI * 2 + Math.random() * 0.3;
        const dist = 220 + Math.random() * 380;
        return {
          id: i,
          x: Math.cos(a) * dist,
          y: Math.sin(a) * dist * 0.7,
          s: 2 + Math.random() * 4,
          d: 0.7 + Math.random() * 1.1,
          c: i % 4 === 0 ? color : i % 2 ? '#ffffff' : '#8ACBFF',
        };
      }),
    [color],
  );
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden" aria-hidden>
      {/* expanding light ring */}
      <motion.span
        className="absolute rounded-full border-2 border-cyan-200"
        style={{ boxShadow: '0 0 40px rgba(92,180,255,.9), inset 0 0 40px rgba(92,180,255,.6)' }}
        initial={{ width: 40, height: 40, opacity: 1 }}
        animate={{ width: 900, height: 900, opacity: 0 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />
      {parts.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full"
          style={{ width: p.s, height: p.s, background: p.c, boxShadow: `0 0 10px 2px ${p.c}` }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.5 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 1 }}
          transition={{ duration: p.d + 0.8, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

/** Full-screen System message on level-up / rank-up. */
export function LevelUpModal() {
  const ev = useUI((s) => s.levelUp);
  const close = useUI((s) => s.setLevelUp);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ev) setTimeout(() => btn.current?.focus(), 50);
  }, [ev]);
  return (
    <AnimatePresence>
      {ev && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#01040b]/90 p-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => close(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Level up"
        >
          <Particles color={ev.rankColor} />
          <motion.div
            className="panel brackets relative w-full max-w-md overflow-hidden px-6 pb-7 pt-5 text-center"
            initial={{ scaleY: 0.05, scaleX: 1.2, opacity: 0, filter: 'brightness(3)' }}
            animate={{ scaleY: 1, scaleX: 1, opacity: 1, filter: 'brightness(1)' }}
            exit={{ scaleY: 0.05, opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.2, 0.9, 0.3, 1.15] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center gap-2.5">
              <span className="sys-icon" aria-hidden>
                !
              </span>
              <span className="sys-title">Notification</span>
            </div>
            <div className="sys-divider mt-4" />
            <motion.div
              className="mt-5 font-display text-4xl font-extrabold italic text-white sm:text-5xl"
              style={{ textShadow: '0 0 18px rgba(92,180,255,1), 0 0 40px rgba(59,158,255,.7)' }}
              initial={{ letterSpacing: '0.5em', opacity: 0 }}
              animate={{ letterSpacing: '0.06em', opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
            >
              {ev.rankUp ? 'RANK UP!' : 'LEVEL UP!'}
            </motion.div>
            <p className="mt-4 font-display text-[17px] text-white text-glow">You have leveled up.</p>
            <p className="mt-1 font-mono text-sm text-slate-200">
              LEVEL <b className="text-white">{ev.level - 1}</b> → <b className="text-white text-glow">{ev.level}</b>
            </p>
            {ev.rankUp && (
              <p className="mt-2 font-display text-base font-bold" style={{ color: ev.rankColor, textShadow: `0 0 14px ${ev.rankColor}` }}>
                New rank: {ev.rankLabel}
              </p>
            )}
            <p className="mt-1 font-mono text-xs text-slate-400">Title: {ev.title}</p>
            <button ref={btn} className="btn mt-6" onClick={() => close(null)}>
              Accept
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Red EMERGENCY QUEST window after the configured hour when today's completion is low. */
export function EmergencyBanner() {
  const { now, todayStats, settings, today } = useSystem();
  const active =
    now.getHours() >= settings.emergencyHour &&
    !todayStats.restDay &&
    todayStats.scheduled > 0 &&
    todayStats.ratio < settings.emergencyThreshold;

  const played = useRef<string | null>(null);
  useEffect(() => {
    if (active && played.current !== today) {
      played.current = today;
      sfx.alert();
    }
  }, [active, today]);

  if (!active) return null;
  const needed = Math.ceil(settings.emergencyThreshold * todayStats.scheduled) - todayStats.done;
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const mins = Math.max(0, Math.round((midnight.getTime() - now.getTime()) / 60000));

  return (
    <motion.div
      role="alert"
      className="relative overflow-hidden rounded-[6px] border-2 border-red-500/90 bg-[#1a0306]/85 px-4 py-3 backdrop-blur"
      animate={{ boxShadow: ['0 0 10px rgba(239,68,68,.35), inset 0 0 14px rgba(239,68,68,.25)', '0 0 36px rgba(239,68,68,.9), inset 0 0 26px rgba(239,68,68,.45)', '0 0 10px rgba(239,68,68,.35), inset 0 0 14px rgba(239,68,68,.25)'] }}
      transition={{ duration: 1.6, repeat: Infinity }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-red-300 font-display font-black text-white" style={{ boxShadow: '0 0 12px rgba(239,68,68,.9)' }}>
          !
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm font-extrabold tracking-[0.25em] text-red-300 sm:text-base" style={{ textShadow: '0 0 10px rgba(239,68,68,.9)' }}>
            EMERGENCY QUEST
          </div>
          <div className="font-display text-[13px] text-red-100">
            Daily Quest incomplete. Clear {needed} more quest{needed === 1 ? '' : 's'} within {Math.floor(mins / 60)}h {mins % 60}m to avoid the Penalty Zone.
          </div>
        </div>
        <button className="btn-ghost text-red-200" onClick={() => setRestDay(today, true)} title="Mark today as a rest day (protects your streak)">
          <Bed size={14} /> Rest day
        </button>
      </div>
    </motion.div>
  );
}

/** Ambient floating "mana" motes rising through the background. */
export function ManaMotes({ count = 18 }: { count?: number }) {
  const motes = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: `${(i * 97) % 100}%`,
        duration: `${14 + ((i * 7) % 16)}s`,
        delay: `-${(i * 3.3) % 20}s`,
        size: 2 + ((i * 13) % 3),
      })),
    [count],
  );
  return (
    <div aria-hidden className="pointer-events-none">
      {motes.map((m) => (
        <span key={m.id} className="sys-mote" style={{ left: m.left, animationDuration: m.duration, animationDelay: m.delay, width: m.size, height: m.size }} />
      ))}
    </div>
  );
}
