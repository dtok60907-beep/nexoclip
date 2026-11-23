'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Sparkles, Upload, Video, Wand2 } from 'lucide-react';
import { saasFetch } from '../../src/lib/saas/api.js';
import { getAuthRequest, validateAuthFields } from '../../src/lib/saas/authForm.js';

const LAST_USED_KEY = 'nexoclip_last_auth';

const AUTH_SLIDES = [
  {
    id: 'ugc',
    image: '/ui-assets/auth-ugc.jpg',
    bg: '#E8F3EC',
    frameBg: '#5BD174',
    title: 'High-Converting UGC & Product Ads',
    description:
      'Turn product photos or short briefs into authentic UGC creator videos, hooks, and commercial reels in minutes.',
    badges: [
      { label: 'Enter Your Prompt', pos: 'top-[14%] -right-4 sm:-right-6', icon: Sparkles },
      { label: 'Upload Product', pos: 'top-[48%] -left-4 sm:-left-6', icon: Upload },
    ],
  },
  {
    id: 'director',
    image: '/ui-assets/create-director.jpg',
    bg: '#EFEBFD',
    frameBg: '#6B55F6',
    title: 'Direct Full Stories with AI Director',
    description:
      'Go from one brief to structured concepts, scripts, storyboards, voiceovers, and multi-scene cinema edits.',
    badges: [
      { label: 'Scene Storyboard', pos: 'top-[16%] -right-4 sm:-right-6', icon: Video },
      { label: 'Auto Script & Shots', pos: 'top-[54%] -left-4 sm:-left-6', icon: Sparkles },
    ],
  },
  {
    id: 'influencer',
    image: '/ui-assets/create-influencer.jpg',
    bg: '#F8EFF6',
    frameBg: '#A855F7',
    title: 'Flexible AI Influencer Creation',
    description:
      'Create ultra-realistic AI brand presenters from prompts or photos while keeping consistent character identity.',
    badges: [
      { label: 'Custom Persona', pos: 'top-[15%] -right-4 sm:-right-6', icon: Sparkles },
      { label: 'Upload Reference', pos: 'top-[52%] -left-4 sm:-left-6', icon: Upload },
    ],
  },
  {
    id: 'motion',
    image: '/media/homepage/3d-animation-3.jpg',
    bg: '#E9F1FC',
    frameBg: '#4A8CF5',
    title: 'Chat-Driven AI Motion & 3D',
    description:
      'Describe educational, promo, or explainer animations in chat and watch every scene come alive with narration.',
    badges: [
      { label: 'Kinetic Scenes', pos: 'top-[16%] -right-4 sm:-right-6', icon: Wand2 },
      { label: 'Auto Narration', pos: 'top-[52%] -left-4 sm:-left-6', icon: Sparkles },
    ],
  },
  {
    id: 'product',
    image: '/showcase/workflow-product.webp',
    bg: '#FBF3E8',
    frameBg: '#D97706',
    title: 'Studio Product Visuals & Commercials',
    description:
      'Produce studio-grade product photography, macro launch shots, and widescreen commercials without a crew.',
    badges: [
      { label: 'Studio Lighting', pos: 'top-[15%] -right-4 sm:-right-6', icon: Sparkles },
      { label: 'Upload Packshot', pos: 'top-[52%] -left-4 sm:-left-6', icon: Upload },
    ],
  },
];

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function AuthCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return undefined;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % AUTH_SLIDES.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [paused]);

  const slide = AUTH_SLIDES[index];
  const step = (delta) => setIndex((prev) => (prev + delta + AUTH_SLIDES.length) % AUTH_SLIDES.length);

  return (
    <aside
      aria-label="Nexoclip Studio use cases"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative hidden md:flex flex-col justify-between overflow-hidden px-9 py-9 transition-colors duration-500 select-none"
      style={{ backgroundColor: slide.bg }}
    >
      {/* Subtle top spacer */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/75 px-3 py-1 text-[11px] font-semibold tracking-wide text-[#4c38d6] backdrop-blur-sm">
          <Sparkles size={12} />
          NEXOCLIP STUDIO
        </span>
        <span className="text-[11.5px] font-medium tabular-nums text-[#5e5e72]">
          0{index + 1} / 0{AUTH_SLIDES.length}
        </span>
      </div>

      {/* Center visual card with floating callout pills + prev/next arrows */}
      <div className="relative my-auto flex items-center justify-center py-4">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous slide"
          className="absolute left-0 z-20 grid h-8 w-8 place-items-center rounded-full bg-white/80 text-[#3a3b4c] shadow-sm backdrop-blur-sm transition hover:bg-white hover:text-[#14141f]"
        >
          <ChevronLeft size={16} />
        </button>

        <div className="relative w-[250px] lg:w-[276px]">
          <div
            className="relative aspect-[3/4] w-full overflow-hidden rounded-[26px] border-4 border-white/75 shadow-[0_24px_56px_-18px_rgba(20,20,38,0.22)] transition-colors duration-500"
            style={{ backgroundColor: slide.frameBg }}
          >
            <img
              key={slide.id}
              src={slide.image}
              alt={slide.title}
              className="h-full w-full object-cover animate-fade-in-up"
            />
          </div>

          {slide.badges.map((badge) => {
            const BadgeIcon = badge.icon;
            return (
              <div
                key={badge.label}
                className={`absolute ${badge.pos} z-10 inline-flex items-center gap-2 rounded-full border border-white/90 bg-white/95 px-3.5 py-2 text-[12px] font-semibold text-[#14141f] shadow-[0_10px_28px_rgba(20,20,38,0.12)] backdrop-blur-md`}
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[#f2f0ff] text-[#5b45f2]">
                  <BadgeIcon size={11} strokeWidth={2.3} />
                </span>
                <span className="whitespace-nowrap">{badge.label}</span>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next slide"
          className="absolute right-0 z-20 grid h-8 w-8 place-items-center rounded-full bg-white/80 text-[#3a3b4c] shadow-sm backdrop-blur-sm transition hover:bg-white hover:text-[#14141f]"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Bottom copy + dash indicator dots (matching Image 1) */}
      <div>
        <h3 className="text-[22px] font-semibold tracking-[-0.025em] text-[#14141f]">
          {slide.title}
        </h3>
        <p className="mt-1.5 max-w-[420px] text-[13px] leading-[1.6] text-[#4b4c60]">
          {slide.description}
        </p>

        <div className="mt-5 flex items-center justify-center gap-1.5" role="tablist" aria-label="Slide indicators">
          {AUTH_SLIDES.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={idx === index}
              aria-label={`Slide ${idx + 1}: ${s.title}`}
              onClick={() => setIndex(idx)}
              className={`h-1 rounded-full transition-all duration-300 ${
                idx === index ? 'w-6 bg-[#14141f]' : 'w-2 bg-[#14141f]/20 hover:bg-[#14141f]/40'
              }`}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

export default function StudioAuthModal({ initialMode = 'login', initialError = '', onClose, onAuthenticated }) {
  const dialog = useRef(null);
  const [mode, setMode] = useState(initialMode);
  const [values, setValues] = useState({ email: '', password: '', displayName: '', marketingOptIn: false });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [google, setGoogle] = useState(false);
  const [promo, setPromo] = useState(null);
  const [lastUsed, setLastUsed] = useState(null);

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    fetch('/api/auth/providers').then((r) => r.json()).then((p) => setGoogle(Boolean(p.google))).catch(() => {});
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
      const result = await saasFetch(path, { ...options, signal: AbortSignal.timeout(20000) });
      if (mode === 'forgot') { setError('If that email is registered, a password reset link has been sent.'); return; }
      remember('email');
      await onAuthenticated(result);
    } catch (cause) {
      setError(cause.status === 401 ? 'Email or password is incorrect.' : cause.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const inputCls = 'w-full h-11 rounded-xl border border-transparent bg-[#f3f4f8] px-4 text-[13.5px] text-[#14141f] placeholder:text-[#8c8da0] outline-none transition focus:border-[#5b45f2] focus:bg-white focus:ring-2 focus:ring-[#5b45f2]/12';
  const register = mode === 'register';

  return (
    <dialog
      ref={dialog}
      className="studio-auth-dialog studio-auth-split nx-auth-fullscreen"
      aria-labelledby="studio-auth-title"
      onCancel={onClose}
      onClick={(event) => { if (event.target === dialog.current) onClose(); }}
    >
      <div className="grid h-full w-full md:grid-cols-2 bg-white">
        {/* Left Carousel */}
        <AuthCarousel />

        {/* Right Clean White Auth Panel (Matching Image 1) */}
        <div className="nx-auth-form relative flex flex-col justify-between overflow-y-auto bg-white px-6 py-6 sm:px-12">
          {/* Top bar: Nexoclip monogram brand + Close */}
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center">
              <img
                src="/brand/nexoclip-lockup.png"
                alt="nexoclip"
                className="h-[24px] w-auto select-none"
              />
            </div>
            <button
              className="grid h-8 w-8 place-items-center rounded-full bg-[#f4f5f9] text-[#5e5e72] transition hover:bg-[#e9eaf2] hover:text-[#14141f]"
              type="button"
              onClick={onClose}
              aria-label="Close sign in"
            >
              ×
            </button>
          </div>

          {/* Center Form Block */}
          <div className="mx-auto my-auto w-full max-w-[360px] py-8">
            <h2 id="studio-auth-title" className="text-center text-[25px] font-semibold tracking-[-0.025em] text-[#14141f]">
              {register ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Welcome to Nexoclip'}
            </h2>
            <p className="mt-1.5 text-center text-[13px] text-[#7a7b90]">
              {register ? 'Sign up to unlock all AI creative studios' : mode === 'forgot' ? 'Enter your email to receive a reset link' : 'Sign in to unlock all features'}
            </p>

            {promo && (
              <div className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-[#ddd7fe] bg-[#f2f0ff] px-3.5 py-2.5 text-[12.5px] font-semibold text-[#5b45f2]">
                <span aria-hidden="true">✦</span> {promo.percent}% off your first month on any monthly plan
              </div>
            )}

            {google && (
              <>
                <a
                  href="/api/auth/google"
                  onClick={() => remember('google')}
                  aria-disabled={busy}
                  className={`relative mt-6 flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border bg-white text-[13.5px] font-semibold text-[#14141f] transition hover:bg-[#fafafd] ${
                    lastUsed === 'google' ? 'border-[#5b45f2]/60 ring-2 ring-[#5b45f2]/10' : 'border-[#e4e5ef]'
                  }`}
                >
                  <GoogleMark /> Continue with Google
                  {lastUsed === 'google' && (
                    <span className="absolute -top-2.5 right-3 rounded-md bg-[#5b45f2] px-1.5 py-0.5 text-[10px] font-bold text-white">
                      Last used
                    </span>
                  )}
                </a>
                <p className="my-5 flex items-center gap-3 text-[11.5px] text-[#9a9bac] before:h-px before:flex-1 before:bg-[#ececf3] after:h-px after:flex-1 after:bg-[#ececf3]">
                  or
                </p>
              </>
            )}

            <form onSubmit={submit} className={`grid gap-3 ${google ? '' : 'mt-6'}`}>
              {register && (
                <input
                  className={inputCls}
                  autoComplete="name"
                  value={values.displayName}
                  onChange={(e) => setValues({ ...values, displayName: e.target.value })}
                  disabled={busy}
                  placeholder="Enter your name"
                  aria-label="Name"
                />
              )}
              <input
                className={inputCls}
                type="email"
                autoComplete="email"
                autoFocus
                required
                placeholder="Enter email"
                aria-label="Email"
                value={values.email}
                onChange={(e) => setValues({ ...values, email: e.target.value })}
                disabled={busy}
              />
              {mode !== 'forgot' && (
                <div className="relative">
                  <input
                    className={`${inputCls} pr-10`}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={register ? 'new-password' : 'current-password'}
                    required
                    minLength={register ? 12 : undefined}
                    placeholder={register ? 'Create password (min. 12 chars)' : 'Enter password'}
                    aria-label="Password"
                    value={values.password}
                    onChange={(e) => setValues({ ...values, password: e.target.value })}
                    disabled={busy}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8c8da0] hover:text-[#14141f]"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              )}

              {!register && mode !== 'forgot' && (
                <div className="flex justify-end -mt-1">
                  <button
                    type="button"
                    className="text-[12px] font-medium text-[#7a7b90] transition hover:text-[#5b45f2]"
                    onClick={() => { setMode('forgot'); setError(''); }}
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              {register && (
                <label className="flex items-start gap-2 text-[12px] leading-5 text-[#5e5e72]">
                  <input
                    type="checkbox"
                    checked={values.marketingOptIn}
                    onChange={(e) => setValues({ ...values, marketingOptIn: e.target.checked })}
                    disabled={busy}
                    className="mt-1 accent-[#5b45f2]"
                  />
                  I&apos;d like to receive NexoClip product updates, tips, and offers via email.
                </label>
              )}

              {error && <p className="studio-auth-error" role="alert">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="mt-1 h-11 rounded-xl bg-[#5b45f2] text-[14px] font-semibold text-white shadow-[0_8px_20px_rgba(91,69,242,0.28)] transition hover:bg-[#4731d8] disabled:opacity-50"
              >
                {busy ? 'Please wait…' : register ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
              </button>
            </form>

            <p className="mt-5 text-center text-[13px] text-[#6e6f82]">
              {mode === 'forgot' ? 'Remembered your password?' : register ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                disabled={busy}
                onClick={() => { setMode(mode === 'forgot' || register ? 'login' : 'register'); setError(''); }}
                className="font-semibold text-[#5b45f2] hover:underline"
              >
                {mode === 'forgot' ? 'Sign in' : register ? 'Sign in' : 'Sign up'}
              </button>
            </p>

            <p className="mt-5 text-center text-[11.5px] leading-relaxed text-[#9a9bac]">
              By clicking Continue, you accept Nexoclip&apos;s{' '}
              <a href="https://www.nexoclip.com/terms" target="_blank" rel="noopener noreferrer" className="text-[#5b45f2] hover:underline">
                Terms of Use
              </a>{' '}
              and{' '}
              <a href="https://www.nexoclip.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[#5b45f2] hover:underline">
                Privacy Policy
              </a>
            </p>
          </div>

          <p className="text-center text-[11px] text-[#a3a4b5]">
            © {new Date().getFullYear()} Nexoclip Studio. All rights reserved.
          </p>
        </div>
      </div>
    </dialog>
  );
}
