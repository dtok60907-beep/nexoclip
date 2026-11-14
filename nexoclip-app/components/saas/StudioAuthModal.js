'use client';

import { useEffect, useRef, useState } from 'react';
import { saasFetch } from '../../src/lib/saas/api.js';
import { getAuthRequest, validateAuthFields } from '../../src/lib/saas/authForm.js';

// Sign in / sign up, split in two: on the left a slideshow of the studios playing their
// clips (brand-free, from the landing's R2 set), on the right Google and email. Same
// requests as before (/api/auth/login, /api/auth/register, /api/auth/google).
const LAST_USED_KEY = 'nexoclip_last_auth';

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
  );
}

function Showcase() {
  return <aside className="nx-auth-art" aria-label="Create with NexoClip">
    <img src="/showcase/airy-hero-800.webp" alt="" width="800" height="267" />
    <div><span>NEXOCLIP STUDIO</span><h3>Your next idea<br />starts here.</h3><p>Bring your stories, products, and imagination to life.</p></div>
  </aside>;
}

export default function StudioAuthModal({ initialMode = 'login', initialError = '', onClose, onAuthenticated }) {
  const dialog = useRef(null);
  const [mode, setMode] = useState(initialMode);
  const [values, setValues] = useState({ email: '', password: '', displayName: '', marketingOptIn: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [google, setGoogle] = useState(false);
  const [promo, setPromo] = useState(null);
  const [lastUsed, setLastUsed] = useState(null);

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    fetch('/api/auth/providers').then((r) => r.json()).then((p) => setGoogle(Boolean(p.google))).catch(() => {});
    // The launch promo, if one runs (no free credits on sign-up, so this is the offer to show).
    fetch('/api/public/plans').then((r) => r.json()).then((p) => setPromo(p.subscriptionsEnabled && p.promo ? p.promo : null)).catch(() => {});
    try { setLastUsed(window.localStorage.getItem(LAST_USED_KEY)); } catch { /* storage blocked */ }
  }, []);

  const remember = (method) => { try { window.localStorage.setItem(LAST_USED_KEY, method); } catch { /* storage blocked */ } };

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const errors = validateAuthFields(values);
    const validation = errors.email || (mode === 'forgot' ? '' : mode === 'register' ? errors.password : !values.password && 'Password is required.');
    if (validation) return setError(validation);
    setBusy(true);
    setError('');
    try {
      const { path, options } = getAuthRequest(mode, values);
      const result = await saasFetch(path, options);
      if (mode === 'forgot') { setError('Jika email terdaftar, link reset sudah dikirim.'); return; }
      remember('email');
      await onAuthenticated(result);
    } catch (cause) {
      setError(cause.status === 401 ? 'Email or password is incorrect.' : cause.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-violet-500/70 focus:bg-white';
  const register = mode === 'register';

  return (
    <dialog ref={dialog} className="studio-auth-dialog studio-auth-split" aria-labelledby="studio-auth-title" onCancel={onClose} onClick={(event) => { if (event.target === dialog.current) onClose(); }}>
      <div className="grid h-full gap-3 p-3 md:grid-cols-[1.05fr_1fr]">
        <Showcase />

        <div className="nx-auth-form relative flex flex-col overflow-y-auto px-5 py-8 sm:px-10">
          <button className="studio-auth-close" type="button" onClick={onClose} aria-label="Close sign in">×</button>
          <div className="m-auto w-full max-w-[380px]">
            <p className="text-center text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>nexo<span className="font-medium text-slate-600">clip</span><span className="text-violet-600">.</span></p>
            <h2 id="studio-auth-title" className="mt-4 text-center text-[26px] font-semibold leading-tight text-slate-900">
              {register ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Welcome to Nexo Clip'}
            </h2>
            <p className="mt-1.5 text-center text-sm text-slate-500">{register ? 'Start making videos and images in minutes.' : 'Sign in to generate and save your work.'}</p>

            {promo && (
              <div className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-600">
                <span aria-hidden="true">✦</span> {promo.percent}% off your first month on any monthly plan
              </div>
            )}

            {google && (
              <a href="/api/auth/google" onClick={() => remember('google')} aria-disabled={busy}
                className={`relative mt-3 flex h-[52px] w-full items-center justify-center gap-3 rounded-xl border bg-white text-sm font-semibold text-slate-900 transition hover:bg-slate-50 ${lastUsed === 'google' ? 'border-violet-500/50' : 'border-slate-200'}`}>
                <GoogleMark /> Continue with Google
                {lastUsed === 'google' && <span className="absolute -top-2.5 right-3 rounded-md bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">Last used</span>}
              </a>
            )}

            {google && <p className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-widest text-slate-400 before:h-px before:flex-1 before:bg-slate-200 after:h-px after:flex-1 after:bg-slate-200">or</p>}

            <form onSubmit={submit} className={`grid gap-3 ${google ? '' : 'mt-6'}`}>
              {register && (
                <label className="grid gap-1.5 text-xs text-slate-600">Name
                  <input className={input} autoComplete="name" value={values.displayName} onChange={(e) => setValues({ ...values, displayName: e.target.value })} disabled={busy} placeholder="Your name" />
                </label>
              )}
              <label className="grid gap-1.5 text-xs text-slate-600">Email
                <input className={input} type="email" autoComplete="email" autoFocus required placeholder="you@example.com" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} disabled={busy} />
              </label>
              {mode !== 'forgot' && <label className="grid gap-1.5 text-xs text-slate-600">Password
                <input className={input} type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 12 : undefined}
                  placeholder={register ? 'At least 12 characters' : 'Your password'} value={values.password} onChange={(e) => setValues({ ...values, password: e.target.value })} disabled={busy} />
              </label>}
              {register && <label className="flex items-start gap-2 text-xs leading-5 text-slate-600"><input type="checkbox" checked={values.marketingOptIn} onChange={(e) => setValues({ ...values, marketingOptIn: e.target.checked })} disabled={busy} className="mt-1 accent-violet-600" />Saya mau menerima update produk, tips, dan promo NexoClip via email.</label>}
              {error && <p className="studio-auth-error" role="alert">{error}</p>}
              <button type="submit" disabled={busy}
                className="mt-1 h-[52px] rounded-xl bg-violet-600 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50">
                {busy ? 'Please wait…' : register ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-slate-500">
              {mode === 'forgot' ? 'Remembered your password?' : register ? 'Already have an account?' : 'New to Nexo Clip?'}{' '}
              <button type="button" disabled={busy} onClick={() => { setMode(mode === 'forgot' || register ? 'login' : 'register'); setError(''); }} className="font-semibold text-violet-600 hover:underline">
                {mode === 'forgot' ? 'Sign in' : register ? 'Sign in' : 'Create an account'}
              </button>
            </p>
            {!register && mode !== 'forgot' && <button type="button" className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-900" onClick={() => { setMode('forgot'); setError(''); }}>Forgot password?</button>}

            <p className="mt-6 border-t border-slate-200 pt-5 text-center text-xs text-slate-500">
              For teams and agencies: <a href="https://wa.me/6285183162659" target="_blank" rel="noopener noreferrer" className="text-slate-600 underline underline-offset-2 hover:text-slate-900">Enterprise plans</a>
            </p>
          </div>
        </div>
      </div>
    </dialog>
  );
}
