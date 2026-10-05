'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { saasFetch } from '../../src/lib/saas/api.js';
import { getAuthRequest, validateAuthFields } from '../../src/lib/saas/authForm.js';
import AuthShell, {
  AuthAlert, AuthDivider, AuthLegal, CheckIcon, PasswordToggle, inputClass, labelClass, primaryButtonClass, secondaryButtonClass,
} from './AuthShell.js';

const MIN_PASSWORD = 12;

const POINTS = [
  { title: 'Every studio, one balance', body: 'Canvas, Video, Image, Cinema and AI Influencer share your credits.' },
  { title: 'See the cost first', body: 'Every Generate button shows its price in credits before you spend any.' },
  { title: 'Pay as you go', body: 'Top up from Rp 249.000 with QRIS or a virtual account. Credits never expire.' },
];

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

const BAR_COLORS = ['', 'bg-red-400', 'bg-amber-400', 'bg-[#A175FF]', 'bg-emerald-500'];

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

  return (
    <AuthShell
      headline={<>From one photo<br />to a video ad.</>}
      subtitle="Create product videos, photos and AI influencer content without a camera or a shoot."
      points={POINTS}
      eyebrow="Get started"
      title="Create your account"
      description="Set up your workspace, then top up credits to start creating."
    >
      {error && (
        <AuthAlert>
          {error}{' '}
          {emailTaken && <Link href="/login" className="font-bold underline underline-offset-2">Sign in instead</Link>}
        </AuthAlert>
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
            <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((shown) => !shown)} />
          </div>
          {values.password && (
            <div className="mt-3">
              <div className="flex gap-1.5" aria-hidden="true">
                {[1, 2, 3, 4].map((bar) => (
                  <span key={bar} className={`h-1.5 flex-1 rounded-full transition-colors ${bar <= strength.score ? BAR_COLORS[strength.score] : 'bg-[#110C2A]/10'}`} />
                ))}
              </div>
              <p className="mt-1.5 text-xs font-semibold text-[#110C2A]/55">{strength.label}</p>
              <ul className="mt-2 space-y-1">
                {passwordChecks(values.password).map((check) => (
                  <li key={check.label} className={`flex items-center gap-2 text-xs ${check.met ? 'text-emerald-600' : 'text-[#110C2A]/45'}`}>
                    <span className={`grid h-4 w-4 place-items-center rounded-full ${check.met ? 'bg-emerald-500 text-white' : 'border border-[#110C2A]/20'}`}>
                      {check.met && <CheckIcon className="h-2.5 w-2.5" />}
                    </span>
                    {check.label}{check.required ? '' : ' (recommended)'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <button type="submit" disabled={loading} className={primaryButtonClass}>
          {loading ? 'Creating your workspace…' : 'Create account'}
        </button>
      </form>

      <AuthDivider>Already have an account?</AuthDivider>
      <Link href="/login" className={`mt-3 ${secondaryButtonClass}`}>Sign in</Link>

      <AuthLegal action="creating an account" />
    </AuthShell>
  );
}
