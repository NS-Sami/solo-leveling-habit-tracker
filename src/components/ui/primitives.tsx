/**
 * Small shared UI building blocks.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

/**
 * System window. Header = circled "!" glyph + boxed glowing title, like the
 * notification windows of a Solo Leveling-style System. Pops open on mount.
 */
export function Panel({
  title,
  icon,
  action,
  children,
  className = '',
  bodyClass = 'p-4',
  centered = false,
  glyph = '!',
}: {
  title?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
  /** Center the title like a System notification. */
  centered?: boolean;
  glyph?: ReactNode;
}) {
  return (
    <motion.section
      className={`panel brackets ${className}`}
      initial={{ opacity: 0, scaleY: 0.85, filter: 'brightness(2)' }}
      animate={{ opacity: 1, scaleY: 1, filter: 'brightness(1)' }}
      transition={{ duration: 0.35, ease: [0.2, 0.9, 0.3, 1.2] }}
      style={{ transformOrigin: 'center' }}
    >
      {(title || action) && (
        <header className="px-3 pb-2 pt-3 sm:px-4">
          <div className={`flex items-center gap-2.5 ${centered ? 'justify-center' : 'justify-between'}`}>
            {title && (
              <h2 className="flex min-w-0 items-center gap-2.5">
                <span className="sys-icon" aria-hidden>
                  {glyph}
                </span>
                <span className="sys-title min-w-0 gap-2 truncate">
                  {icon && <span className="hidden text-cyan-200 sm:inline-flex">{icon}</span>}
                  {title}
                </span>
              </h2>
            )}
            {action}
          </div>
          <div className="sys-divider mt-2.5" />
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </motion.section>
  );
}

export function ProgressBar({
  value,
  color = '#3B9EFF',
  height = 8,
  label,
}: {
  value: number; // 0..1
  color?: string;
  height?: number;
  label?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 1000) / 10;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className="relative w-full overflow-hidden rounded-full bg-white/5 ring-1 ring-inset ring-white/5"
      style={{ height }}
    >
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ background: `linear-gradient(90deg, ${color}99, ${color})`, boxShadow: `0 0 12px ${color}88` }}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      />
    </div>
  );
}

/** Stylized System checkbox. 44px hit area on touch, 28px visual box. */
export function QuestCheck({
  checked,
  onToggle,
  color = '#5CB4FF',
  label,
  dim = false,
  size = 'md',
  highlight = false,
}: {
  checked: boolean;
  onToggle: () => void;
  color?: string;
  label: string;
  dim?: boolean;
  size?: 'sm' | 'md' | 'lg';
  highlight?: boolean;
}) {
  const box = size === 'lg' ? 'h-8 w-8' : size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';
  const icon = size === 'lg' ? 20 : size === 'sm' ? 13 : 15;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onToggle}
      className={`group relative inline-flex items-center justify-center rounded-md ${size === 'sm' ? 'p-1' : 'p-1.5'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
        dim ? 'opacity-35 hover:opacity-80' : ''
      }`}
    >
      <motion.span
        className={`${box} flex items-center justify-center rounded-[3px] border-2 transition-colors ${
          checked ? '' : highlight ? 'border-cyan-200 bg-cyan-400/10' : 'border-cyan-300/45 bg-black/40 group-hover:border-cyan-200'
        }`}
        style={
          checked
            ? {
                background: `${color}40`,
                borderColor: '#D9EEFF',
                // small grid cells get a cheaper single glow (hundreds render at once)
                boxShadow: size === 'sm' ? `0 0 6px ${color}` : `0 0 12px ${color}, inset 0 0 8px ${color}`,
              }
            : undefined
        }
        whileTap={{ scale: 0.82 }}
        animate={checked ? { scale: [0.85, 1.12, 1] } : { scale: 1 }}
        transition={{ duration: 0.25 }}
        // `initial={false}`: no pop animation on first render — only when the user toggles.
        initial={false}
      >
        <AnimatePresence initial={false}>
          {checked && (
            <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}>
              <Check size={icon} strokeWidth={3.5} className="text-white" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.span>
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`panel brackets max-h-[92dvh] w-full overflow-y-auto rounded-b-none sm:rounded-xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
          >
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-cyan-300/30 bg-void-800/95 px-4 py-3">
              <h2 className="flex min-w-0 items-center gap-2.5">
                <span className="sys-icon" aria-hidden>
                  !
                </span>
                <span className="sys-title truncate">{title}</span>
              </h2>
              <button className="btn-ghost" onClick={onClose} aria-label="Close">
                <X size={16} />
              </button>
            </header>
            <div className="p-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function StatTile({ label, value, sub, color }: { label: string; value: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <div className="panel px-3 py-2.5">
      <div className="font-display text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200">{label}</div>
      <div className="mt-0.5 font-mono text-xl font-bold text-slate-50" style={color ? { textShadow: `0 0 14px ${color}88` } : undefined}>
        {value}
      </div>
      {sub && <div className="font-mono text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}

export const CATEGORY_STYLE: Record<string, { icon: string; tint: string }> = {
  Physical: { icon: '⚔', tint: 'text-cyan-300' },
  Spiritual: { icon: '☾', tint: 'text-emerald-300' },
  Intellectual: { icon: '◈', tint: 'text-violet-300' },
  Health: { icon: '✚', tint: 'text-amber-300' },
  Routine: { icon: '◷', tint: 'text-rose-300' },
};
