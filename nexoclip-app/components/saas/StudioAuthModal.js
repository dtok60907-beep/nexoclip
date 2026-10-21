'use client';

import { useEffect, useRef, useState } from 'react';
import { saasFetch } from '../../src/lib/saas/api.js';
import { getAuthRequest, validateAuthFields } from '../../src/lib/saas/authForm.js';

export default function StudioAuthModal({ initialMode = 'login', initialError = '', onClose, onAuthenticated }) {
  const dialog = useRef(null);
  const [mode, setMode] = useState(initialMode);
  const [values, setValues] = useState({ email: '', password: '', displayName: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    fetch('/api/auth/providers').then((r) => r.json()).then((p) => setGoogle(Boolean(p.google))).catch(() => {});
  }, []);

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => previous?.focus?.();
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const errors = validateAuthFields(values);
    const validation = errors.email || (mode === 'register' ? errors.password : !values.password && 'Password is required.');
    if (validation) return setError(validation);
    setBusy(true);
    setError('');
    try {
      const { path, options } = getAuthRequest(mode, values);
      const result = await saasFetch(path, options);
      await onAuthenticated(result);
    } catch (cause) {
      setError(cause.status === 401 ? 'Email or password is incorrect.' : cause.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} className="studio-auth-dialog" aria-labelledby="studio-auth-title" aria-describedby="studio-auth-description" onCancel={onClose} onClick={(event) => { if (event.target === dialog.current) onClose(); }}>
      <div className="studio-auth-inner">
        <button className="studio-auth-close" type="button" onClick={onClose} aria-label="Close sign in">×</button>
        <div className="studio-auth-mark" aria-hidden="true">✦</div>
        <p className="suite-eyebrow">YOUR NEXT IDEA STARTS HERE</p>
        <h2 id="studio-auth-title">{mode === 'login' ? 'Welcome to your studio.' : 'Make room for your ideas.'}</h2>
        <p id="studio-auth-description">{mode === 'login' ? 'Sign in to generate and save your creations. Your prompt and settings will stay right here.' : 'Create your Nexoclip account to start generating.'}</p>
        {google && <>
          <a className="studio-auth-google" href="/api/auth/google" aria-disabled={busy}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            Continue with Google
          </a>
          <p className="studio-auth-divider"><span>or with email</span></p>
        </>}
        <form onSubmit={submit}>
          {mode === 'register' && <label>Name<input autoComplete="name" value={values.displayName} onChange={e => setValues({ ...values, displayName: e.target.value })} disabled={busy} /></label>}
          <label>Email<input type="email" autoComplete="email" autoFocus required placeholder="you@example.com" value={values.email} onChange={e => setValues({ ...values, email: e.target.value })} disabled={busy} /></label>
          <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 12 : undefined} placeholder={mode === 'register' ? 'At least 12 characters' : 'Your password'} value={values.password} onChange={e => setValues({ ...values, password: e.target.value })} disabled={busy} /></label>
          {error && <p className="studio-auth-error" role="alert">{error}</p>}
          <button className="suite-primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'} <span aria-hidden="true">↗</span></button>
        </form>
        <p className="studio-auth-switch">{mode === 'login' ? 'New to Nexoclip?' : 'Already have an account?'} <button type="button" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
        <p className="studio-auth-note">Explore freely. Sign in when you’re ready to create.</p>
      </div>
    </dialog>
  );
}
