/**
 * Connects the app to Supabase: the auth client, the running sync engine for the
 * signed-in account, and the status the interface displays.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { create } from 'zustand';
import { appConfig } from '../config';
import { switchDatabase, userDbName } from '../data/db';
import { onLocalChange } from '../data/changes';
import { SyncEngine, type SyncStatus } from './engine';
import { SupabaseRemote } from './remote';

/* ---- Status shown in the interface ---- */

interface SyncStore {
  /** 'none' = no account in use: progress lives only in this browser. */
  mode: 'none' | 'cloud';
  email: string | null;
  status: SyncStatus;
  setStatus: (s: SyncStatus) => void;
  setAccount: (mode: 'none' | 'cloud', email: string | null) => void;
}

const INITIAL: SyncStatus = { phase: 'loading', pending: 0, conflicts: 0, lastSavedAt: null, message: null };

export const useSync = create<SyncStore>((set) => ({
  mode: 'none',
  email: null,
  status: INITIAL,
  setStatus: (status) => set({ status }),
  setAccount: (mode, email) => set({ mode, email }),
}));

/* ---- Supabase client ---- */

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (appConfig.state !== 'cloud') throw new Error('Supabase is not configured');
  client ??= createClient(appConfig.config.url, appConfig.config.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Lets an email link work on a different device from the one that requested it.
      flowType: 'implicit',
    },
  });
  return client;
}

/**
 * Where email links return to: this page, on whatever address it is running from.
 * Works on localhost and under the GitHub Pages /repository/ folder without changes.
 */
export function authRedirectUrl(): string {
  return `${location.origin}${location.pathname}`;
}

/* ---- Running engine ---- */

let engine: SyncEngine | null = null;
let remote: SupabaseRemote | null = null;

export const getEngine = () => engine;
export const getRemote = () => remote;

/** Opens this account's local database and prepares its sync engine. */
export function connectAccount(userId: string, email: string | null) {
  stopSync();
  const db = switchDatabase(userDbName(userId), true);
  remote = new SupabaseRemote(getSupabase(), userId);
  engine = new SyncEngine(db, remote, (s) => useSync.getState().setStatus(s));
  useSync.getState().setAccount('cloud', email);
  useSync.getState().setStatus(INITIAL);
  return { db, engine, remote };
}

export function startSync() {
  if (!engine) return;
  onLocalChange(engine.syncSoon);
  engine.start();
}

export function stopSync() {
  onLocalChange(null);
  engine?.stop();
  engine = null;
  remote = null;
}
