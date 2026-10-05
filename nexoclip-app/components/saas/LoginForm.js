'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { saasFetch } from '../../src/lib/saas/api.js';
import { getAuthRequest, validateAuthFields } from '../../src/lib/saas/authForm.js';
import AuthShell, {
  AuthAlert, AuthDivider, AuthLegal, PasswordToggle, inputClass, labelClass, primaryButtonClass, secondaryButtonClass,
} from './AuthShell.js';

const POINTS = [
  { title: 'Your boards and results', body: 'Canvas projects, galleries and folders are where you left them.' },
  { title: 'One credit balance', body: 'Every studio draws from the same credits. Top up anytime.' },
  { title: 'Always see the cost', body: 'The credit estimate shows before you press Generate.' },
];

// Messages for ?error= values set by the Google sign-in routes.
const URL_ERRORS = {
  google: 'Google sign-in did not complete. Please try again.',
  google_state: 'Your Google sign-in expired. Please try again.',
  google_unconfigured: 'Google sign-in is not available right now. Use your email instead.',
};

function readQuery() {
  if (typeof window === 'undefined') return { returnTo: '/studio', urlError: null };
  const params = new URLSearchParams(window.location.search);
  const next = params.get('next');
  return {
    returnTo: next?.startsWith('/') && !next.startsWith('//') ? next : '/studio',
    urlError: URL_ERRORS[params.get('error')] || null,
  };
}

export default function LoginForm() {
  const router = useRouter();
  const [{ returnTo, urlError }] = useState(readQuery);
  const [values, setValues] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(urlError);
  const [loading, setLoading] = useState(false);

  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    const errors = validateAuthFields(values);
    if (errors.email) return setError(errors.email);
    if (!values.password) return setError('Password is required.');
    setLoading(true);
    setError(null);
    try {
      const { path, options } = getAuthRequest('login', values);
      await saasFetch(path, options);
      router.push(returnTo);
    } catch (cause) {
      setError(cause?.status === 401 ? 'Email or password is incorrect.' : cause?.message || 'We could not sign you in. Please try again.');
      setLoading(false);
    }
  }

  return (
    <AuthShell
      headline={<>Welcome back<br />to your studio.</>}
      subtitle="Pick up where you left off: product videos, photos and AI influencer content, all in one place."
      points={POINTS}
      eyebrow="Welcome back"
      title="Sign in to Nexoclip"
      description="Use the email and password you signed up with."
    >
      {error && <AuthAlert>{error}</AuthAlert>}

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <div>
          <label htmlFor="email" className={labelClass}>Email</label>
          <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" autoFocus value={values.email} onChange={set('email')} disabled={loading} className={inputClass} />
        </div>
        <div>
          <label htmlFor="password" className={labelClass}>Password</label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Your password"
              value={values.password}
              onChange={set('password')}
              disabled={loading}
              className={`${inputClass} pr-12`}
            />
            <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((shown) => !shown)} />
          </div>
        </div>
        <button type="submit" disabled={loading} className={primaryButtonClass}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <AuthDivider>Don&apos;t have an account?</AuthDivider>
      <Link href="/register" className={`mt-3 ${secondaryButtonClass}`}>
        Create an account
      </Link>

      <AuthLegal action="signing in" />
    </AuthShell>
  );
}
