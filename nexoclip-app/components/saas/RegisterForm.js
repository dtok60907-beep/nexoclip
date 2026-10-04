'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { saasFetch } from '../../src/lib/saas/api.js';
import { getAuthRequest, validateAuthFields } from '../../src/lib/saas/authForm.js';

const MIN_PASSWORD = 12;

// Only the length is required (see validateAuthFields); the rest are hints.
function passwordChecks(password) {
  return [
    { label: `At least ${MIN_PASSWORD} characters`, met: password.length >= MIN_PASSWORD, required: true },
    { label: 'Upper and lower case letters', met: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: 'A number or symbol', met: /[\d\W_]/.test(password) },
  ];
}

function strengthOf(password) {
  if (!password) return { score: 0, label: '' };
  const met = passwordChecks(password).filter((check) => check.met).length;
  const score = password.length < MIN_PASSWORD ? 1 : met === 3 && password.length >= 16 ? 4 : met + 1;
  return { score, label: ['', 'Too short', 'Okay', 'Good', 'Strong'][score] };
}

const BENEFITS = [
  { title: '50 free credits', body: 'Enough for a first draft video or about 20 images. No card needed.' },
  { title: 'Every studio, one balance', body: 'Canvas, Video, Image, Cinema and AI Influencer share your credits.' },
  { title: 'Pay as you go', body: 'Top up from Rp 50.000 with QRIS or a virtual account. Credits never expire.' },
];

const Check = ({ className = '' }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </svg>
);

const Eye = ({ open }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {!open && <path d="M3 3l18 18" />}
  </svg>
);

export default function RegisterForm() {
  const router = useRouter();
  const [values, setValues] = useState({ displayName: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [loading, setLoading] = useState(false);

  const strength = strengthOf(values.password);
  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setEmailTaken(false);
    if (!values.displayName.trim()) return setError('Tell us what to call you.');
    const errors = validateAuthFields(values);
    if (errors.email || errors.password) return setError(errors.email || errors.password);
    setLoading(true);
    setError(null);
    try {
      const { path, options } = getAuthRequest('register', values);
      await saasFetch(path, options);
      router.push('/onboarding');
    } catch (cause) {
      if (cause?.status === 409) setEmailTaken(true);
      setError(cause?.status === 409 ? 'An account with this email already exists.' : cause?.message || 'We could not create your account. Please try again.');
      setLoading(false);
    }
  }

  const inputClass =
    'w-full rounded-[18px] border border-[#110C2A]/10 bg-white px-4 py-3.5 text-sm text-[#110C2A] placeholder:text-[#110C2A]/35 outline-none transition focus:border-[#A175FF] focus:ring-4 focus:ring-[#A175FF]/15 disabled:opacity-60';
  const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-[#110C2A]/55';

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#FFF6DE] text-[#110C2A]">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#A175FF]/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-[#8BDFDD]/35 blur-3xl" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-[1fr_minmax(0,440px)] lg:gap-16 lg:px-8">
        {/* Brand panel */}
        <section className="relative hidden overflow-hidden rounded-[40px] bg-[#110C2A] p-10 text-white shadow-[0_24px_80px_rgba(17,12,42,0.25)] lg:block xl:p-12">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#A175FF]/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-10 h-60 w-60 rounded-full bg-[#8BDFDD]/20 blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-[16px] bg-[#A175FF] text-lg font-black text-[#110C2A]">N</div>
              <span className="text-lg font-bold tracking-tight">Nexoclip</span>
            </div>
            <h2 className="mt-12 text-4xl font-black leading-[1.05] tracking-tight xl:text-5xl">
              From one photo<br />to a video ad.
            </h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/70">
              Create product videos, photos and AI influencer content without a camera or a shoot.
            </p>
            <ul className="mt-10 space-y-5">
              {BENEFITS.map((benefit) => (
                <li key={benefit.title} className="flex gap-4">
                  <span className="mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-[#A175FF]/20 text-[#C9B0FF]">
                    <Check className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block font-bold">{benefit.title}</span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-white/60">{benefit.body}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-12 flex flex-wrap gap-2">
              {['Canvas', 'Video Studio', 'Image Studio', 'Cinema', 'AI Influencer'].map((tool) => (
                <span key={tool} className="rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 text-xs font-semibold text-white/75">{tool}</span>
              ))}
            </div>
          </div>
        </section>

        {/* Form */}
        <section className="mx-auto w-full max-w-md rounded-[40px] border border-white/70 bg-white/75 p-7 shadow-[0_24px_80px_rgba(17,12,42,0.12)] backdrop-blur-xl sm:p-9">
          <div className="mb-5 flex justify-center lg:hidden">
            <div className="grid h-12 w-12 place-items-center rounded-[18px] bg-[#110C2A] text-lg font-black text-[#A175FF] shadow-lg shadow-[#A175FF]/20">N</div>
          </div>
          <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.2em] text-[#A175FF] lg:text-left">Get started free</p>
          <h1 className="text-center text-3xl font-black tracking-tight lg:text-left">Create your account</h1>
          <p className="mt-2 text-center text-sm text-[#110C2A]/60 lg:text-left">50 free credits are waiting in your workspace.</p>

          {error && (
            <div role="alert" className="mt-6 rounded-[14px] border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
              {error}{' '}
              {emailTaken && <Link href="/login" className="font-bold underline underline-offset-2">Sign in instead</Link>}
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="displayName" className={labelClass}>Your name</label>
              <input id="displayName" name="displayName" autoComplete="name" placeholder="e.g. Rina Putri" autoFocus value={values.displayName} onChange={set('displayName')} disabled={loading} className={inputClass} />
            </div>
            <div>
              <label htmlFor="email" className={labelClass}>Email</label>
              <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={values.email} onChange={set('email')} disabled={loading} className={inputClass} />
            </div>
            <div>
              <label htmlFor="password" className={labelClass}>Password</label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder={`At least ${MIN_PASSWORD} characters`}
                  value={values.password}
                  onChange={set('password')}
                  disabled={loading}
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-[#110C2A]/45 transition hover:bg-[#110C2A]/5 hover:text-[#110C2A]"
                >
                  <Eye open={showPassword} />
                </button>
              </div>
              {values.password && (
                <div className="mt-3">
                  <div className="flex gap-1.5" aria-hidden="true">
                    {[1, 2, 3, 4].map((bar) => (
                      <span key={bar} className={`h-1.5 flex-1 rounded-full transition-colors ${bar <= strength.score ? ['', 'bg-red-400', 'bg-amber-400', 'bg-[#A175FF]', 'bg-emerald-500'][strength.score] : 'bg-[#110C2A]/10'}`} />
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs font-semibold text-[#110C2A]/55">{strength.label}</p>
                  <ul className="mt-2 space-y-1">
                    {passwordChecks(values.password).map((check) => (
                      <li key={check.label} className={`flex items-center gap-2 text-xs ${check.met ? 'text-emerald-600' : 'text-[#110C2A]/45'}`}>
                        <span className={`grid h-4 w-4 place-items-center rounded-full ${check.met ? 'bg-emerald-500 text-white' : 'border border-[#110C2A]/20'}`}>
                          {check.met && <Check className="h-2.5 w-2.5" />}
                        </span>
                        {check.label}{check.required ? '' : ' (recommended)'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-[18px] bg-[#A175FF] px-4 py-3.5 text-sm font-bold text-[#110C2A] shadow-lg shadow-[#A175FF]/25 transition hover:-translate-y-0.5 hover:bg-[#9467f4] disabled:translate-y-0 disabled:opacity-60"
            >
              {loading ? 'Creating your workspace…' : 'Create free account'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-[#110C2A]/60">
            Already have an account?{' '}
            <Link href="/login" className="font-bold text-[#7d3cff] underline-offset-2 hover:underline">Sign in</Link>
          </p>
          <p className="mt-4 text-center text-xs leading-5 text-[#110C2A]/45">
            By creating an account you agree to our{' '}
            <a href="https://www.nexoclip.com/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-black/70">Terms of use</a>{' '}&amp;{' '}
            <a href="https://www.nexoclip.com/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-black/70">Privacy Policy</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
