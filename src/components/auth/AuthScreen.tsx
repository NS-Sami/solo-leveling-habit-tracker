/**
 * Sign in, create account, forgot password and set new password, as System windows.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { authRedirectUrl, getSupabase } from '../../sync/runtime';

type View = 'signin' | 'signup' | 'forgot';

const MIN_PASSWORD = 8;

/** Turns Supabase's auth errors into plain advice. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'Email or password is incorrect.';
  if (m.includes('email not confirmed')) return 'Please confirm your email first. Check your inbox and spam folder for the link.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many emails were requested. Please wait and try again later.';
  if (m.includes('not authorized')) return 'This email address cannot receive mail yet. The site owner needs to set up custom email (SMTP) in Supabase.';
  if (m.includes('already registered')) return 'This email already has an account. Try signing in instead.';
  if (m.includes('fetch') || m.includes('network')) return 'Cannot reach the server. Check your connection and try again.';
  return message;
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <section className="panel brackets w-full max-w-md">
        <header className="px-4 pb-2 pt-4">
          <div className="flex items-center justify-center gap-2.5">
            <span className="sys-icon" aria-hidden>
              !
            </span>
            <h1 className="sys-title">{title}</h1>
          </div>
          <div className="sys-divider mt-3" />
        </header>
        <div className="p-4 pt-2 sm:p-6 sm:pt-3">{children}</div>
      </section>
    </main>
  );
}

function Field(props: { id: string; label: string; type: string; value: string; onChange: (v: string) => void; autoComplete: string; hint?: string }) {
  return (
    <div>
      <label className="label" htmlFor={props.id}>
        {props.label}
      </label>
      <input
        id={props.id}
        className="input"
        type={props.type}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete}
        required
        minLength={props.type === 'password' ? MIN_PASSWORD : undefined}
        aria-describedby={props.hint ? `${props.id}-hint` : undefined}
      />
      {props.hint && (
        <p id={`${props.id}-hint`} className="mt-1 font-mono text-[10px] text-slate-400">
          {props.hint}
        </p>
      )}
    </div>
  );
}

const Feedback = ({ error, notice }: { error: string | null; notice: string | null }) => (
  <>
    {error && (
      <p role="alert" className="rounded border border-red-500/60 bg-red-950/40 px-3 py-2 font-mono text-xs text-red-200">
        {error}
      </p>
    )}
    {notice && (
      <p role="status" className="rounded border border-cyan-300/50 bg-cyan-500/10 px-3 py-2 font-mono text-xs text-cyan-100">
        {notice}
      </p>
    )}
  </>
);

export function AuthScreen({ onContinueLocally, initialError }: { onContinueLocally: () => void; initialError?: string | null }) {
  const [view, setView] = useState<View>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [notice, setNotice] = useState<string | null>(null);

  const go = (v: View) => {
    setView(v);
    setError(null);
    setNotice(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const auth = getSupabase().auth;
      if (view === 'signin') {
        const { error: err } = await auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else if (view === 'signup') {
        const { data, error: err } = await auth.signUp({ email, password, options: { emailRedirectTo: authRedirectUrl() } });
        if (err) throw err;
        if (!data.session) setNotice(`Almost there. Open the confirmation link sent to ${email}, then sign in. Check your spam folder too.`);
      } else {
        const { error: err } = await auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl() });
        if (err) throw err;
        setNotice(`If ${email} has an account, a reset link is on its way.`);
      }
    } catch (err) {
      setError(friendly((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const title = view === 'signin' ? 'Sign In' : view === 'signup' ? 'Create Account' : 'Reset Password';

  return (
    <Shell title={title}>
      <p className="mb-4 text-center font-display text-[15px] text-white text-glow">
        {view === 'forgot' ? 'Enter your email to receive a reset link.' : 'Your progress follows you to every device.'}
      </p>
      <form className="space-y-3" onSubmit={submit}>
        <Field id="auth-email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        {view !== 'forgot' && (
          <Field
            id="auth-password"
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={view === 'signup' ? 'new-password' : 'current-password'}
            hint={view === 'signup' ? `At least ${MIN_PASSWORD} characters.` : undefined}
          />
        )}
        <Feedback error={error} notice={notice} />
        <button className="btn w-full" disabled={busy}>
          {busy ? 'Please wait…' : view === 'signin' ? 'Sign In' : view === 'signup' ? 'Create Account' : 'Send Reset Link'}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap justify-center gap-1">
        {view !== 'signin' && (
          <button type="button" className="btn-ghost" onClick={() => go('signin')}>
            Back to sign in
          </button>
        )}
        {view === 'signin' && (
          <>
            <button type="button" className="btn-ghost" onClick={() => go('signup')}>
              Create account
            </button>
            <button type="button" className="btn-ghost" onClick={() => go('forgot')}>
              Forgot password?
            </button>
          </>
        )}
      </div>

      <div className="sys-divider my-4" />
      <button type="button" className="btn-ghost w-full" onClick={onContinueLocally}>
        Continue without an account
      </button>
      <p className="mt-1 text-center font-mono text-[10px] text-slate-400">Progress then stays in this browser only and does not sync.</p>
    </Shell>
  );
}

/** Shown after following the link in a password reset email. */
export function NewPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase().auth.updateUser({ password });
    setBusy(false);
    if (err) setError(friendly(err.message));
    else onDone();
  };

  return (
    <Shell title="New Password">
      <form className="space-y-3" onSubmit={submit}>
        <Field id="new-password" label="New password" type="password" value={password} onChange={setPassword} autoComplete="new-password" hint={`At least ${MIN_PASSWORD} characters.`} />
        <Field id="new-password-2" label="Repeat new password" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        <Feedback error={error} notice={null} />
        <button className="btn w-full" disabled={busy}>
          {busy ? 'Saving…' : 'Save New Password'}
        </button>
      </form>
    </Shell>
  );
}

/** Used for connection failures, bad configuration and first-time loading. */
export function MessageScreen({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <Shell title={title}>
      <p className="text-center font-display text-[15px] leading-snug text-white">{message}</p>
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </Shell>
  );
}
