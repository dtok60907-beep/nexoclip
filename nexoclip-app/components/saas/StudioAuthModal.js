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
