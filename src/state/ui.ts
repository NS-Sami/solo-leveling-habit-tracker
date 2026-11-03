/**
 * Ephemeral UI state (not persisted): active tab, toasts, modals.
 */
import { create } from 'zustand';

export type Tab = 'today' | 'grid' | 'stats' | 'quests' | 'settings';

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone?: 'system' | 'gold' | 'crimson' | 'success';
}

export interface LevelUpEvent {
  level: number;
  rankLabel: string;
  rankColor: string;
  rankUp: boolean;
  title: string;
}

interface UIState {
  tab: Tab;
  setTab: (t: Tab) => void;
  toasts: Toast[];
  pushToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  levelUp: LevelUpEvent | null;
  setLevelUp: (e: LevelUpEvent | null) => void;
  theater: boolean;
  setTheater: (v: boolean) => void;
}

let nextId = 1;

const initialTab = (): Tab => {
  try {
    const t = localStorage.getItem('the-system:tab') as Tab | null;
    if (t && ['today', 'grid', 'stats', 'quests', 'settings'].includes(t)) return t;
  } catch {
    /* storage unavailable */
  }
  return 'today';
};

export const useUI = create<UIState>((set) => ({
  tab: initialTab(),
  setTab: (tab) => {
    try {
      localStorage.setItem('the-system:tab', tab);
    } catch {
      /* ignore */
    }
    set({ tab });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  toasts: [],
  pushToast: (t) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 2600);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  levelUp: null,
  setLevelUp: (levelUp) => set({ levelUp }),
  theater: false,
  setTheater: (theater) => set({ theater }),
}));
