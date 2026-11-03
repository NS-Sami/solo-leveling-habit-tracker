/**
 * App shell: header (brand + compact HUD), tab navigation (top on desktop,
 * bottom bar on phones), page outlet, and the global System overlays.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { BarChart3, Grid3x3, ScrollText, Settings as Cog, Swords } from 'lucide-react';
import { useEffect } from 'react';
import { useUI, type Tab } from './state/ui';
import { PlayerStatus } from './components/hud/PlayerStatus';
import { EmergencyBanner, LevelUpModal, ManaMotes, Toasts } from './components/system/SystemOverlays';
import { TheaterModal } from './components/media/MotivationHub';
import { TodayPage } from './pages/TodayPage';
import { GridPage } from './pages/GridPage';
import { StatsPage } from './pages/StatsPage';
import { QuestsPage } from './pages/QuestsPage';
import { SettingsPage } from './pages/SettingsPage';

const TABS: { id: Tab; label: string; icon: typeof Swords }[] = [
  { id: 'today', label: 'Today', icon: Swords },
  { id: 'grid', label: 'Grid', icon: Grid3x3 },
  { id: 'stats', label: 'Stats', icon: BarChart3 },
  { id: 'quests', label: 'Quests', icon: ScrollText },
  { id: 'settings', label: 'Settings', icon: Cog },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="sys-icon" aria-hidden>
        !
      </span>
      <div className="leading-none">
        <div className="whitespace-nowrap font-display text-[15px] font-extrabold tracking-[0.32em] text-white text-glow">SYSTEM</div>
        <div className="hidden font-mono text-[9px] tracking-widest text-cyan-200/70 sm:block">HUNTER HABIT INTERFACE</div>
      </div>
    </div>
  );
}

export default function App() {
  const tab = useUI((s) => s.tab);
  const setTab = useUI((s) => s.setTab);

  // keyboard shortcuts 1-5 switch tabs
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < TABS.length) setTab(TABS[i].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTab]);

  return (
    <div className="relative min-h-dvh pb-24 md:pb-8">
      <ManaMotes />
      <header className="sticky top-0 z-40 bg-void-900/85 backdrop-blur-lg" style={{ boxShadow: '0 1px 0 rgba(140,200,255,.45), 0 6px 24px rgba(59,158,255,.18)' }}>
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <div className="shrink-0">
            <Logo />
          </div>
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`relative flex items-center gap-1.5 rounded-lg px-3 py-2 font-display text-[11px] font-bold uppercase tracking-widest transition ${
                  tab === t.id ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <t.icon size={14} />
                {t.label}
                {tab === t.id && <motion.span layoutId="tab-underline" className="absolute inset-x-2 -bottom-[11px] h-[2px] bg-cyan-300 shadow-glow-lg" />}
              </button>
            ))}
          </nav>
          <div className="ml-auto min-w-0 flex-1 sm:max-w-64 md:w-64 md:flex-none">{tab !== 'today' && <PlayerStatus compact />}</div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl space-y-4 px-4 py-4">
        <EmergencyBanner />
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
            {tab === 'today' && <TodayPage />}
            {tab === 'grid' && <GridPage />}
            {tab === 'stats' && <StatsPage />}
            {tab === 'quests' && <QuestsPage />}
            {tab === 'settings' && <SettingsPage />}
          </motion.div>
        </AnimatePresence>
        <footer className="pt-6 text-center font-mono text-[10px] text-slate-600">
          The System v1.0 · offline-first · your data never leaves this device · fan-made, original artwork
        </footer>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 bg-void-900/95 backdrop-blur-lg md:hidden" style={{ boxShadow: '0 -1px 0 rgba(140,200,255,.45), 0 -6px 24px rgba(59,158,255,.18)' }} aria-label="Main">
        <div className="grid grid-cols-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 pt-2 font-display text-[9px] font-bold uppercase tracking-wider ${tab === t.id ? 'text-cyan-200' : 'text-slate-500'}`}
            >
              <t.icon size={20} className={tab === t.id ? 'drop-shadow-[0_0_6px_rgba(92,180,255,0.9)]' : ''} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <Toasts />
      <LevelUpModal />
      <TheaterModal />
    </div>
  );
}
