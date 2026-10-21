'use client';

import { useEffect, useRef, useState } from 'react';
import { saasFetch } from '../../src/lib/saas/api.js';
import { getAuthRequest, validateAuthFields } from '../../src/lib/saas/authForm.js';

// Sign in / sign up, split in two: on the left a slideshow of the studios playing their
// clips (brand-free, from the landing's R2 set), on the right Google and email. Same
// requests as before (/api/auth/login, /api/auth/register, /api/auth/google).
const CLIPS = 'https://assets.nexoclip.com/landing/v1';
const SLIDES = [
  { title: 'AI Director', text: 'Tell the idea; the Director writes the concept, script and shot list, then makes the video.', chips: ['Bahasa Indonesia', 'Script to video'], clip: 'micro-drama-movie-148', poster: 'https://assets.nexoclip.com/portfolio-thumbnails/micro-drama-movie/Dragon%20warrior%20trailer.mp4.jpg' },
  { title: 'Video Studio', text: 'Cinematic video from text or a photo with Seedance, Kling, Veo and Hailuo.', chips: ['Up to 1080p', 'Many models'], clip: 'experimental-vfx-131', poster: 'https://assets.nexoclip.com/portfolio-thumbnails/experimental-vfx/Absurd%20city.mp4.jpg' },
  { title: 'Canvas', text: 'Prompts, references, images and videos on one board, with your team.', chips: ['Node board', 'Live with your team'], clip: '3d-animation-6', poster: 'https://assets.nexoclip.com/portfolio-thumbnails/3d-animation/strawberry%20%26%20pineapple.mp4.jpg' },
  { title: 'AI Characters', text: 'Virtual faces that stay consistent across every piece of content.', chips: ['Consistent face', 'Reusable'], clip: 'affiliate-ugc-83', poster: 'https://assets.nexoclip.com/portfolio-thumbnails/affiliate-ugc/Fashion%20mix.mp4.jpg' },
];
const SLIDE_MS = 6000;
const LAST_USED_KEY = 'nexoclip_last_auth';

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
  );
}

// Left half: the studios one after another, each with its clip, chips, title and line,
// and a row of progress bars that doubles as tabs.
function Showcase() {
  const [index, setIndex] = useState(0);
  const [reduce, setReduce] = useState(false);
  useEffect(() => { setReduce(window.matchMedia('(prefers-reduced-motion: reduce)').matches); }, []);
  useEffect(() => {
    if (reduce) return undefined;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % SLIDES.length), SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [index, reduce]);
  const slide = SLIDES[index];
  return (
    <div className="relative hidden overflow-hidden rounded-[22px] bg-black md:block">
      {/* The poster sits underneath, so a slide never flashes black while its clip loads. */}
      <img key={`p-${slide.clip}`} src={slide.poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
      {!reduce && <video key={slide.clip} src={`${CLIPS}/${slide.clip}-720.mp4`} autoPlay muted loop playsInline preload="auto" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />}
      {/* Fetch every slide's poster up front so switching is instant. */}
      <div className="hidden" aria-hidden="true">{SLIDES.map((s) => <img key={s.poster} src={s.poster} alt="" />)}</div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-6">
        <div className="flex flex-wrap gap-2">
          {slide.chips.map((chip) => (
            <span key={chip} className="rounded-md bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">✓ {chip}</span>
          ))}
        </div>
        <h3 className="mt-3 text-4xl font-bold uppercase leading-none tracking-tight text-white" style={{ fontFamily: 'var(--font-display)' }}>{slide.title}</h3>
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-white/70">{slide.text}</p>
        <div className="mt-5 grid grid-cols-4 gap-2">
          {SLIDES.map((s, i) => (
            <button key={s.title} type="button" onClick={() => setIndex(i)} className="text-left" aria-label={`Show ${s.title}`}>
              <span className="block h-[3px] overflow-hidden rounded-full bg-white/25">
                <span className="block h-full rounded-full bg-white"
                  style={i < index ? { width: '100%' } : i === index ? { width: reduce ? '100%' : '0%', animation: reduce ? 'none' : `auth-progress ${SLIDE_MS}ms linear forwards` } : { width: '0%' }} />
              </span>
              <span className={`mt-2 block truncate text-[11px] ${i === index ? 'font-semibold text-white' : 'text-white/55'}`}>{s.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function StudioAuthModal({ initialMode = 'login', initialError = '', onClose, onAuthenticated }) {
  const dialog = useRef(null);
  const [mode, setMode] = useState(initialMode);
  const [values, setValues] = useState({ email: '', password: '', displayName: '' });
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
    const validation = errors.email || (mode === 'register' ? errors.password : !values.password && 'Password is required.');
    if (validation) return setError(validation);
    setBusy(true);
    setError('');
    try {
      const { path, options } = getAuthRequest(mode, values);
      const result = await saasFetch(path, options);
      remember('email');
      await onAuthenticated(result);
    } catch (cause) {
      setError(cause.status === 401 ? 'Email or password is incorrect.' : cause.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-[#d4ff64]/70 focus:bg-white/[0.06]';
  const register = mode === 'register';

  return (
    <dialog ref={dialog} className="studio-auth-dialog studio-auth-split" aria-labelledby="studio-auth-title" onCancel={onClose} onClick={(event) => { if (event.target === dialog.current) onClose(); }}>
      <div className="grid h-full gap-3 p-3 md:grid-cols-[1.05fr_1fr]">
        <Showcase />

        <div className="relative flex flex-col overflow-y-auto px-5 py-8 sm:px-10">
          <button className="studio-auth-close" type="button" onClick={onClose} aria-label="Close sign in">×</button>
          <div className="m-auto w-full max-w-[380px]">
            <p className="text-center text-2xl font-bold tracking-tight text-white" style={{ fontFamily: 'var(--font-display)' }}>nexo<span className="font-medium text-white/55">clip</span><span className="text-[#d4ff64]">.</span></p>
            <h2 id="studio-auth-title" className="mt-4 text-center text-[26px] font-semibold leading-tight text-white">
              {register ? 'Create your account' : 'Welcome to Nexo Clip'}
            </h2>
            <p className="mt-1.5 text-center text-sm text-white/50">{register ? 'Start making videos and images in minutes.' : 'Sign in to generate and save your work.'}</p>

            {promo && (
              <div className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-[#d4ff64]/10 px-4 py-3 text-sm font-semibold text-[#d4ff64]">
                <span aria-hidden="true">✦</span> {promo.percent}% off your first month on any monthly plan
              </div>
            )}

            {google && (
              <a href="/api/auth/google" onClick={() => remember('google')} aria-disabled={busy}
                className={`relative mt-3 flex h-[52px] w-full items-center justify-center gap-3 rounded-xl border bg-white/[0.03] text-sm font-semibold text-white transition hover:bg-white/[0.07] ${lastUsed === 'google' ? 'border-[#d4ff64]/50' : 'border-white/12'}`}>
                <GoogleMark /> Continue with Google
                {lastUsed === 'google' && <span className="absolute -top-2.5 right-3 rounded-md bg-[#d4ff64] px-1.5 py-0.5 text-[10px] font-bold text-black">Last used</span>}
              </a>
            )}

            {google && <p className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-widest text-white/35 before:h-px before:flex-1 before:bg-white/10 after:h-px after:flex-1 after:bg-white/10">or</p>}

            <form onSubmit={submit} className={`grid gap-3 ${google ? '' : 'mt-6'}`}>
              {register && (
                <label className="grid gap-1.5 text-xs text-white/60">Name
                  <input className={input} autoComplete="name" value={values.displayName} onChange={(e) => setValues({ ...values, displayName: e.target.value })} disabled={busy} placeholder="Your name" />
                </label>
              )}
              <label className="grid gap-1.5 text-xs text-white/60">Email
                <input className={input} type="email" autoComplete="email" autoFocus required placeholder="you@example.com" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} disabled={busy} />
              </label>
              <label className="grid gap-1.5 text-xs text-white/60">Password
                <input className={input} type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 12 : undefined}
                  placeholder={register ? 'At least 12 characters' : 'Your password'} value={values.password} onChange={(e) => setValues({ ...values, password: e.target.value })} disabled={busy} />
              </label>
              {error && <p className="studio-auth-error" role="alert">{error}</p>}
              <button type="submit" disabled={busy}
                className="mt-1 h-[52px] rounded-xl bg-[#d4ff64] text-sm font-bold text-black transition hover:brightness-95 disabled:opacity-50">
                {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-white/50">
              {register ? 'Already have an account?' : 'New to Nexo Clip?'}{' '}
              <button type="button" disabled={busy} onClick={() => { setMode(register ? 'login' : 'register'); setError(''); }} className="font-semibold text-[#d4ff64] hover:underline">
                {register ? 'Sign in' : 'Create an account'}
              </button>
            </p>

            <p className="mt-6 border-t border-white/10 pt-5 text-center text-xs text-white/40">
              For teams and agencies: <a href="https://wa.me/6285183162659" target="_blank" rel="noopener noreferrer" className="text-white/70 underline underline-offset-2 hover:text-white">Enterprise plans</a>
            </p>
          </div>
        </div>
      </div>
    </dialog>
  );
}
