/**
 * Reads public/config.js. Everything here is visible to every visitor, so it may
 * only hold the project URL and the publishable key. Row Level Security is what
 * protects the data; keeping this key hidden would add nothing.
 */
export interface CloudConfig {
  url: string;
  key: string;
}

export type ConfigResult = { state: 'local' } | { state: 'cloud'; config: CloudConfig } | { state: 'invalid'; reason: string };

/** A service_role key is a JWT, so its role can be read without any secret. */
function jwtRole(key: string): string | null {
  try {
    return JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role ?? null;
  } catch {
    return null;
  }
}

export function checkConfig(raw: { supabaseUrl?: string; supabasePublishableKey?: string } | undefined): ConfigResult {
  const url = raw?.supabaseUrl?.trim() ?? '';
  const key = raw?.supabasePublishableKey?.trim() ?? '';
  if (!url && !key) return { state: 'local' };
  if (url.includes('YOUR-PROJECT') || key.includes('YOUR-PUBLISHABLE')) {
    return { state: 'invalid', reason: 'public/config.js still contains the example placeholders.' };
  }
  if (!url || !key) return { state: 'invalid', reason: 'public/config.js needs both the project URL and the publishable key.' };
  if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
    return {
      state: 'invalid',
      reason: 'public/config.js contains a SECRET key. Remove it now, then rotate that key in the Supabase dashboard, because this file is public. Use the publishable key instead.',
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { state: 'invalid', reason: 'The Supabase URL in public/config.js is not a valid address.' };
  }
  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !isLocal) return { state: 'invalid', reason: 'The Supabase URL must start with https://' };
  return { state: 'cloud', config: { url: url.replace(/\/$/, ''), key } };
}

declare global {
  interface Window {
    SYSTEM_CONFIG?: { supabaseUrl?: string; supabasePublishableKey?: string };
  }
}

export const appConfig: ConfigResult = checkConfig(typeof window === 'undefined' ? undefined : window.SYSTEM_CONFIG);
