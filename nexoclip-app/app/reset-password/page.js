'use client';

import { useEffect, useState } from 'react';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setToken(new URLSearchParams(window.location.search).get('token') || ''), []);
  async function submit(event) {
    event.preventDefault();
    if (password.length < 12) return setMessage('Password must be at least 12 characters.');
    setBusy(true); setMessage('');
    const response = await fetch('/api/auth/password/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? 'Password updated. You can now return to the sign-in page.' : payload.error || 'Reset link is invalid or has expired.');
    setBusy(false);
  }
  return <main className="flex min-h-screen items-center justify-center bg-black px-5 text-white"><form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[.04] p-7"><img src="/brand/nexoclip-lockup-white.png" alt="nexoclip" className="h-[26px] w-auto select-none" /><h1 className="mt-8 text-2xl font-semibold">Create a new password</h1><p className="mt-2 text-sm text-white/55">Use at least 12 characters.</p><input className="mt-6 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3" type="password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" disabled={!token || busy} />{message && <p className="mt-3 text-sm text-white/70">{message}</p>}<button className="mt-5 w-full rounded-xl bg-[#d4ff64] px-4 py-3 font-semibold text-black disabled:opacity-50" disabled={!token || busy}>{busy ? 'Saving…' : 'Update password'}</button></form></main>;
}
