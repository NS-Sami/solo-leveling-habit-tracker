import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { SystemProvider } from './state/SystemProvider';
import { AuthGate } from './state/AuthGate';
import './index.css';

function Boot() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <div className="font-display text-sm tracking-[0.4em] text-cyan-300 text-glow">[ SYSTEM ]</div>
      <div className="font-mono text-xs text-slate-400">Initializing hunter interface…</div>
    </div>
  );
}

// Offline support: service worker auto-updates in the background.
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate>
      {(dbName) => (
        // Remounting on database change means accounts never share in-memory state.
        <SystemProvider key={dbName} fallback={<Boot />}>
          <App />
        </SystemProvider>
      )}
    </AuthGate>
  </React.StrictMode>,
);
