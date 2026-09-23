'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saasFetch } from '../../src/lib/saas/api.js';
import { getAuthRequest, validateAuthFields } from '../../src/lib/saas/authForm.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginForm() {
  const router = useRouter();
  const requestedReturnTo = typeof window === 'undefined'
    ? null
    : new URLSearchParams(window.location.search).get('next');
  const returnTo = requestedReturnTo?.startsWith('/') && !requestedReturnTo.startsWith('//')
    ? requestedReturnTo
    : '/studio';
  const [step, setStep] = useState('email'); // 'email' | 'password'
  const [values, setValues] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);

  function continueWithEmail(event) {
    event.preventDefault();
    setNotice(null);
    const email = values.email.trim();
    if (!email) return setError('Email is required.');
    if (!EMAIL_RE.test(email)) return setError('Enter a valid email address.');
    setError(null);
    setStep('password');
  }

  function backToEmail() {
    setError(null);
    setNotice(null);
    setStep('email');
  }

  async function submitLogin(event) {
    event.preventDefault();
    const errors = validateAuthFields(values);
    if (errors.password) return setError(errors.password);
    setLoading(true);
    setError(null);
    try {
      const { path, options } = getAuthRequest('login', values);
      await saasFetch(path, options);
      router.push(returnTo);
    } catch (cause) {
      setError(cause?.message || 'We could not sign you in. Please try again.');
      setLoading(false);
    }
  }

  const inputClass =
    'w-full rounded-[18px] border border-[#110C2A]/10 bg-white px-4 py-3.5 text-sm text-[#110C2A] placeholder:text-[#110C2A]/35 outline-none transition focus:border-[#A175FF] focus:ring-4 focus:ring-[#A175FF]/15 disabled:opacity-60';
  const primaryBtn =
    'w-full rounded-[18px] bg-[#A175FF] px-4 py-3.5 text-sm font-bold text-[#110C2A] shadow-lg shadow-[#A175FF]/25 transition hover:-translate-y-0.5 hover:bg-[#9467f4] disabled:opacity-60';

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#FFF6DE] px-4 py-12 text-[#110C2A]">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#A175FF]/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-[#8BDFDD]/35 blur-3xl" />
      <div className="relative w-full max-w-sm rounded-[40px] border border-white/70 bg-white/75 p-7 shadow-[0_24px_80px_rgba(17,12,42,0.12)] backdrop-blur-xl sm:p-9">
        <div className="mb-5 flex justify-center">
          <div className="grid h-12 w-12 place-items-center rounded-[18px] bg-[#110C2A] text-lg font-black text-[#A175FF] shadow-lg shadow-[#A175FF]/20">
            N
          </div>
        </div>

        <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.2em] text-[#A175FF]">Welcome back</p>
        <h1 className="mb-8 text-center text-3xl font-black tracking-tight text-[#110C2A]">Sign in to Nexoclip</h1>

        {error && (
          <p role="alert" className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}
        {notice && (
          <p className="mb-3 rounded-lg border border-black/10 bg-black/[0.03] px-3 py-2 text-sm text-black/60">
            {notice}
          </p>
        )}

        {step === 'email' ? (
          <>
            <form onSubmit={continueWithEmail} className="space-y-3" noValidate>
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Enter email"
                autoFocus
                value={values.email}
                onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
                className={inputClass}
              />
              <button type="submit" className={primaryBtn}>Continue</button>
            </form>
          </>
        ) : (
          <form onSubmit={submitLogin} className="space-y-3" noValidate>
            <button
              type="button"
              onClick={backToEmail}
              className="flex w-full items-center justify-between gap-3 rounded-[18px] border border-[#110C2A]/10 bg-white px-3.5 py-2.5 text-left text-sm text-[#110C2A] transition hover:border-[#A175FF]/50 hover:bg-[#A175FF]/5"
            >
              <span className="min-w-0 truncate">{values.email}</span>
              <span className="flex-shrink-0 text-xs font-medium text-black/45">Change</span>
            </button>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              autoFocus
              value={values.password}
              onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
              disabled={loading}
              className={inputClass}
            />
            <button type="submit" disabled={loading} className={primaryBtn}>
              {loading ? 'Please wait…' : 'Continue'}
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-xs leading-5 text-[#110C2A]/50">
          By clicking “Continue” you agree to our{' '}
          <a href="https://www.nexoclip.com/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-black/70">Terms of use</a>{' '}&amp;{' '}
          <a href="https://www.nexoclip.com/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-black/70">Privacy Policy</a>.
        </p>
      </div>
    </main>
  );
}
