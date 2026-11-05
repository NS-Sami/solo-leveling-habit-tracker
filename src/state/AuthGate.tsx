/**
 * Decides what the app opens into:
 *   ?demo=1            sample data in its own database, no account
 *   no Supabase config this browser only (the original behaviour)
 *   Supabase config    sign in, load the account, offer to import, then the app
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { appConfig } from '../config';
import { DEMO_DB_NAME, LEGACY_DB_NAME, ensureSeeded, isDemoRequested, requestPersistence, seedDemoIfRequested, switchDatabase } from '../data/db';
import { connectAccount, getRemote, getSupabase, startSync, stopSync, useSync } from '../sync/runtime';
import { accountIsEmpty, readLocalSummary, seedAccount, type LocalSummary } from '../sync/importLocal';
import { AuthScreen, MessageScreen, NewPasswordScreen } from '../components/auth/AuthScreen';
import { ImportPanel } from '../components/auth/ImportDialog';

const LOCAL_CHOICE = 'the-system:local-mode';
const importKey = (userId: string) => `the-system:import-decided:${userId}`;

const store = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode: the choice simply is not remembered */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export const rememberImportDecision = (userId: string) => store.set(importKey(userId), new Date().toISOString());

/** Leaves "this device only" mode and shows the sign-in screen. */
export function chooseAccountMode() {
  store.remove(LOCAL_CHOICE);
  location.reload();
}

// Read before the Supabase client consumes the URL.
const startHash = typeof location === 'undefined' ? '' : location.hash;
const arrivedForRecovery = /[#&]type=recovery/.test(startHash);
const linkError = (() => {
  const params = new URLSearchParams(startHash.replace(/^#/, ''));
  const description = params.get('error_description');
  return description ? `That email link did not work: ${description}. Please request a new one.` : null;
})();

type Stage =
  | { name: 'boot' }
  | { name: 'signed-out' }
  | { name: 'recovery' }
  | { name: 'loading-account' }
  | { name: 'account-error'; message: string }
  | { name: 'ask-import'; summary: LocalSummary; empty: boolean; userId: string }
  | { name: 'ready' };

const Loading = ({ text }: { text: string }) => (
  <div role="status" className="flex min-h-dvh flex-col items-center justify-center gap-3">
    <div className="font-display text-sm tracking-[0.4em] text-cyan-300 text-glow">[ SYSTEM ]</div>
    <div className="font-mono text-xs text-slate-400">{text}</div>
  </div>
);

async function openOffline(name: string) {
  switchDatabase(name, false);
  await ensureSeeded();
  await seedDemoIfRequested();
  await requestPersistence();
  useSync.getState().setAccount('none', null);
}

export function AuthGate({ children }: { children: (dbName: string) => ReactNode }) {
  const [stage, setStage] = useState<Stage>({ name: 'boot' });
  const [dbName, setDbName] = useState(LEGACY_DB_NAME);
  const [retry, setRetry] = useState(0);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const recovering = useRef(arrivedForRecovery);

  const userId = session?.user.id ?? null;
  const email = session?.user.email ?? null;

  const openLocally = useCallback(async (name: string) => {
    await openOffline(name);
    setDbName(name);
    setStage({ name: 'ready' });
  }, []);

  /* ---- Which mode are we in? ---- */
  useEffect(() => {
    if (isDemoRequested()) return void openLocally(DEMO_DB_NAME);
    if (appConfig.state === 'local') return void openLocally(LEGACY_DB_NAME);
    if (appConfig.state === 'invalid') return;
    if (store.get(LOCAL_CHOICE) && !recovering.current) return void openLocally(LEGACY_DB_NAME);

    const auth = getSupabase().auth;
    // Only state updates here: awaiting Supabase inside this callback can deadlock it.
    const { data } = auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') {
        recovering.current = true;
        setStage({ name: 'recovery' });
      }
      setSession(next);
    });
    auth
      .getSession()
      .then(({ data: d }) => setSession(d.session))
      .catch(() => setSession(null));
    return () => data.subscription.unsubscribe();
  }, [openLocally]);

  /* ---- Signed in or out? ---- */
  useEffect(() => {
    if (appConfig.state !== 'cloud' || isDemoRequested() || session === undefined) return;
    if (store.get(LOCAL_CHOICE) && !recovering.current) return;
    if (recovering.current) return setStage({ name: 'recovery' });
    if (!userId) {
      stopSync();
      useSync.getState().setAccount('none', null);
      return setStage({ name: 'signed-out' });
    }

    let cancelled = false;
    (async () => {
      setStage({ name: 'loading-account' });
      try {
        const { db, engine, remote } = connectAccount(userId, email);
        await db.open();
        setDbName(db.name);
        await requestPersistence();

        // A device that has synced before opens instantly, even offline.
        if (await db.settings.get('settings')) {
          startSync();
          if (!cancelled) setStage({ name: 'ready' });
          await offerImport(false);
          return;
        }

        const empty = await accountIsEmpty(remote);
        if (cancelled) return;
        if (!(await offerImport(empty))) {
          if (empty) await seedAccount(remote);
          await engine.pull();
          startSync();
          if (!cancelled) setStage({ name: 'ready' });
        }
      } catch (err) {
        if (!cancelled) setStage({ name: 'account-error', message: (err as Error).message });
      }

      /** Pauses on the import question if this browser has unimported progress. */
      async function offerImport(empty: boolean): Promise<boolean> {
        if (store.get(importKey(userId!))) return false;
        const summary = await readLocalSummary();
        if (!summary || cancelled) return false;
        setStage({ name: 'ask-import', summary, empty, userId: userId! });
        return true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, email, session === undefined, retry]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Screens ---- */
  if (appConfig.state === 'invalid') return <MessageScreen title="Setup Needed" message={appConfig.reason} />;

  switch (stage.name) {
    case 'boot':
      return <Loading text="Initializing hunter interface…" />;
    case 'signed-out':
      return (
        <AuthScreen
          initialError={linkError}
          onContinueLocally={() => {
            store.set(LOCAL_CHOICE, '1');
            void openLocally(LEGACY_DB_NAME);
          }}
        />
      );
    case 'recovery':
      return (
        <NewPasswordScreen
          onDone={() => {
            recovering.current = false;
            history.replaceState(null, '', location.pathname + location.search);
            setRetry((n) => n + 1);
          }}
        />
      );
    case 'loading-account':
      return <Loading text="Loading your progress…" />;
    case 'account-error':
      return (
        <MessageScreen
          title="Cannot Load"
          message={`Your progress could not be loaded, so nothing is shown yet. Your saved data is safe. (${stage.message})`}
          action={
            <>
              <button className="btn" onClick={() => setRetry((n) => n + 1)}>
                Try Again
              </button>
              <button className="btn-ghost" onClick={() => void getSupabase().auth.signOut({ scope: 'local' })}>
                Sign out
              </button>
            </>
          }
        />
      );
    case 'ask-import': {
      const finish = async () => {
        rememberImportDecision(stage.userId);
        const remote = getRemote();
        if (remote && (await accountIsEmpty(remote))) await seedAccount(remote);
        setRetry((n) => n + 1);
      };
      return (
        <main className="flex min-h-dvh items-center justify-center p-4">
          <section className="panel brackets w-full max-w-md p-4 sm:p-6">
            <div className="mb-3 flex items-center justify-center gap-2.5">
              <span className="sys-icon" aria-hidden>
                !
              </span>
              <h1 className="sys-title">Import Progress</h1>
            </div>
            <ImportPanel summary={stage.summary} remote={getRemote()!} onImported={finish} onSkip={finish} skipLabel="Skip" />
          </section>
        </main>
      );
    }
    case 'ready':
      return <>{children(dbName)}</>;
  }
}
