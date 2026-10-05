'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CATEGORIES, EXPERIENCE, GOALS, PLATFORMS, ROLES, SOURCES, TEAM_SIZES, TOOLS, recommendTool,
} from '../../src/lib/onboarding/options.js';

// ---------------------------------------------------------------- icons ----

const svg = (paths) => function Icon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {paths}
    </svg>
  );
};

const Icons = {
  check: svg(<path d="M5 12.5l4.5 4.5L19 7.5" />),
  back: svg(<path d="M15 6l-6 6 6 6" />),
  arrow: svg(<><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>),
  sparkle: svg(<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />),
  video: svg(<><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></>),
  image: svg(<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-9 9" /></>),
  user: svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>),
  camera: svg(<><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>),
  board: svg(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="8.5" y="14" width="7" height="7" rx="1.5" /><path d="M6.5 10v2h11v-2M12 12v2" /></>),
  chat: svg(<path d="M4 5h16v11H9l-5 4z" />),
  coins: svg(<><ellipse cx="9" cy="7" rx="6" ry="3" /><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7" /><path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.7-2.7-3-6-3" /></>),
  qr: svg(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v7h-4M14 21v-3" /></>),
  clock: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
};

const GOAL_ICONS = { 'product-video': Icons.video, 'product-photo': Icons.image, influencer: Icons.user, cinematic: Icons.camera, campaign: Icons.board, ugc: Icons.chat };
const TOOL_ICONS = { canvas: Icons.board, video: Icons.video, image: Icons.image, cinema: Icons.camera, 'ai-influencer': Icons.user };

// ---------------------------------------------------------------- steps ----

// `question` steps count toward the "Step n of N" label; the rest are intro,
// explainer and finish screens.
const STEPS = [
  { id: 'welcome' },
  { id: 'role', question: true },
  { id: 'brand', question: true },
  { id: 'goals', question: true },
  { id: 'platforms', question: true },
  { id: 'experience', question: true },
  { id: 'source', question: true },
  { id: 'tools' },
  { id: 'credits' },
  { id: 'done' },
];
const QUESTION_COUNT = STEPS.filter((step) => step.question).length;

const EMPTY = { role: null, brandName: '', category: null, goals: [], platforms: [], experience: null, teamSize: null, source: null };

function canContinue(stepId, answers) {
  switch (stepId) {
    case 'role': return Boolean(answers.role);
    case 'brand': return Boolean(answers.category);
    case 'goals': return answers.goals.length > 0;
    case 'platforms': return answers.platforms.length > 0;
    case 'experience': return Boolean(answers.experience && answers.teamSize);
    default: return true;
  }
}

// ----------------------------------------------------------- primitives ----

function OptionCard({ selected, onClick, label, hint, icon: Icon, multi }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`group relative flex w-full items-start gap-3.5 rounded-[20px] border p-4 text-left transition duration-150 ${
        selected
          ? 'border-[#A175FF] bg-[#A175FF]/10 shadow-[0_0_0_4px_rgba(161,117,255,0.15)]'
          : 'border-[#110C2A]/10 bg-white hover:-translate-y-0.5 hover:border-[#A175FF]/50 hover:shadow-[0_10px_30px_-12px_rgba(17,12,42,0.25)]'
      }`}
    >
      {Icon && (
        <span className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-[14px] transition ${selected ? 'bg-[#A175FF] text-[#110C2A]' : 'bg-[#110C2A]/[.05] text-[#110C2A]/70 group-hover:text-[#7d3cff]'}`}>
          <Icon />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-[#110C2A]">{label}</span>
        {hint && <span className="mt-0.5 block text-[13px] leading-snug text-[#110C2A]/55">{hint}</span>}
      </span>
      <span className={`mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center border transition ${multi ? 'rounded-[6px]' : 'rounded-full'} ${selected ? 'border-[#A175FF] bg-[#A175FF] text-[#110C2A]' : 'border-[#110C2A]/20 bg-white'}`}>
        {selected && <Icons.check className="h-3.5 w-3.5" />}
      </span>
    </button>
  );
}

function Chip({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-sm font-semibold transition ${
        selected ? 'border-[#A175FF] bg-[#A175FF] text-[#110C2A]' : 'border-[#110C2A]/12 bg-white text-[#110C2A]/75 hover:border-[#A175FF]/60 hover:text-[#110C2A]'
      }`}
    >
      {selected && <Icons.check className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

function StepHeader({ eyebrow, title, subtitle }) {
  return (
    <header className="mb-7">
      {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#A175FF]">{eyebrow}</p>}
      <h1 className="text-[28px] font-black leading-tight tracking-tight text-[#110C2A] sm:text-[34px]">{title}</h1>
      {subtitle && <p className="mt-2.5 text-[15px] leading-relaxed text-[#110C2A]/60">{subtitle}</p>}
    </header>
  );
}

const SectionLabel = ({ children }) => <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[#110C2A]/50">{children}</p>;

// ---------------------------------------------------------------- flow -----

export default function OnboardingFlow() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const step = STEPS[stepIndex];
  const firstName = name.split(/\s+/)[0] || 'there';
  const recommended = useMemo(() => recommendTool(answers.goals), [answers.goals]);
  const questionNumber = STEPS.slice(0, stepIndex + 1).filter((item) => item.question).length;

  // Only signed-in users who have not finished onboarding belong here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await fetch('/api/auth/session', { credentials: 'include' }).then((res) => res.json());
        if (!session.authenticated) return router.replace('/login?next=/onboarding');
        const state = await fetch('/api/onboarding', { credentials: 'include' }).then((res) => res.json());
        if (cancelled) return;
        if (state.status) return router.replace('/studio');
        setName(session.user?.displayName || '');
        setReady(true);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  const save = useCallback(async (status, destination) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status, answers }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Could not save your answers');
      router.push(destination);
    } catch (cause) {
      setError(cause.message);
      setSaving(false);
    }
  }, [answers, router]);

  const next = useCallback(() => {
    if (!canContinue(step.id, answers)) return;
    setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
  }, [answers, step.id]);
  const back = () => setStepIndex((index) => Math.max(index - 1, 0));

  // Enter moves forward (except while typing in the brand name, where it
  // still advances, and on the final screen, which has explicit buttons).
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Enter' || event.shiftKey || step.id === 'done' || saving) return;
      event.preventDefault();
      next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, saving, step.id]);

  const choose = (key, value) => setAnswers((current) => ({ ...current, [key]: current[key] === value ? null : value }));
  const toggle = (key, value) => setAnswers((current) => ({
    ...current,
    [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value],
  }));

  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#FFF6DE]">
        <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#A175FF]/25 border-t-[#A175FF]" aria-label="Loading" />
      </main>
    );
  }

  const progress = Math.round((stepIndex / (STEPS.length - 1)) * 100);
  const nextLabel = step.id === 'welcome' ? "Let's go" : step.id === 'source' && !answers.source ? 'Skip this one' : step.id === 'credits' ? 'Finish setup' : 'Continue';

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[#FFF6DE] text-[#110C2A]">
      <style>{`
        @keyframes nxo-step-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .nxo-step { animation: nxo-step-in 380ms cubic-bezier(.2,.8,.2,1) both; }
        @media (prefers-reduced-motion: reduce) { .nxo-step { animation: none; } }
      `}</style>
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#A175FF]/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-[#8BDFDD]/35 blur-3xl" />

      {/* Top bar */}
      <div className="relative z-10 mx-auto flex w-full max-w-3xl items-center gap-4 px-5 pt-6 sm:px-8">
        <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-[14px] bg-[#110C2A] text-base font-black text-[#A175FF]">N</div>
        <div className="flex-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-[#110C2A]/10" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-gradient-to-r from-[#A175FF] to-[#7d3cff] transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#110C2A]/45">
            {step.question ? `Step ${questionNumber} of ${QUESTION_COUNT}` : step.id === 'done' ? 'All set' : 'Getting started'}
          </p>
        </div>
        {step.id !== 'done' && (
          <button type="button" onClick={() => save('skipped', '/studio')} disabled={saving} className="flex-shrink-0 rounded-full px-3 py-2 text-sm font-semibold text-[#110C2A]/55 transition hover:bg-[#110C2A]/5 hover:text-[#110C2A] disabled:opacity-50">
            Skip for now
          </button>
        )}
      </div>

      {/* Step body */}
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pb-36 pt-10 sm:px-8 sm:pt-14">
        <div key={step.id} className="nxo-step">
          {step.id === 'welcome' && (
            <div className="text-center sm:pt-6">
              <div className="mx-auto mb-8 grid h-20 w-20 place-items-center rounded-[28px] bg-[#110C2A] text-[#A175FF] shadow-[0_20px_50px_-15px_rgba(161,117,255,0.7)]">
                <Icons.sparkle className="h-9 w-9" />
              </div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#A175FF]">Welcome to Nexoclip</p>
              <h1 className="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">Hi {firstName}, let&apos;s set up<br className="hidden sm:block" /> your studio.</h1>
              <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-[#110C2A]/60">
                A few quick questions so we can point you to the right tools. It takes about two minutes, and you can change your mind anytime.
              </p>
              <div className="mx-auto mt-10 grid max-w-xl gap-3 text-left sm:grid-cols-3">
                {[
                  [Icons.clock, 'About 2 minutes', `${QUESTION_COUNT} short questions`],
                  [Icons.coins, '50 free credits', 'Already in your workspace'],
                  [Icons.sparkle, 'A tailored start', 'We suggest where to begin'],
                ].map(([Icon, title, body]) => (
                  <div key={title} className="rounded-[20px] border border-white/70 bg-white/70 p-4 backdrop-blur">
                    <Icon className="h-5 w-5 text-[#7d3cff]" />
                    <p className="mt-3 text-sm font-bold">{title}</p>
                    <p className="mt-0.5 text-[13px] text-[#110C2A]/55">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step.id === 'role' && (
            <>
              <StepHeader eyebrow="About you" title="What best describes you?" subtitle="This helps us point you to the tools that fit how you work." />
              <div className="grid gap-3 sm:grid-cols-2">
                {ROLES.map((role) => <OptionCard key={role.id} label={role.label} hint={role.hint} selected={answers.role === role.id} onClick={() => choose('role', role.id)} />)}
              </div>
            </>
          )}

          {step.id === 'brand' && (
            <>
              <StepHeader eyebrow="Your brand" title="Tell us about what you sell" subtitle="Your brand name is optional. The category helps us understand what you make." />
              <label htmlFor="brandName" className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-[#110C2A]/50">Brand or shop name <span className="font-semibold normal-case tracking-normal text-[#110C2A]/35">(optional)</span></label>
              <input
                id="brandName"
                value={answers.brandName}
                onChange={(event) => setAnswers((current) => ({ ...current, brandName: event.target.value }))}
                maxLength={80}
                placeholder="e.g. Kopi Senja, Glow Lab"
                className="w-full rounded-[18px] border border-[#110C2A]/10 bg-white px-4 py-3.5 text-sm outline-none transition placeholder:text-[#110C2A]/35 focus:border-[#A175FF] focus:ring-4 focus:ring-[#A175FF]/15"
              />
              <div className="mt-8">
                <SectionLabel>Product category</SectionLabel>
                <div className="flex flex-wrap gap-2.5">
                  {CATEGORIES.map((category) => <Chip key={category.id} selected={answers.category === category.id} onClick={() => choose('category', category.id)}>{category.label}</Chip>)}
                </div>
              </div>
            </>
          )}

          {step.id === 'goals' && (
            <>
              <StepHeader eyebrow="Your goals" title="What do you want to create?" subtitle="Pick everything that applies. Your first suggestion comes from these." />
              <div className="grid gap-3 sm:grid-cols-2">
                {GOALS.map((goal) => <OptionCard key={goal.id} multi icon={GOAL_ICONS[goal.id]} label={goal.label} hint={goal.hint} selected={answers.goals.includes(goal.id)} onClick={() => toggle('goals', goal.id)} />)}
              </div>
              <p className="mt-4 text-[13px] text-[#110C2A]/50">{answers.goals.length ? `${answers.goals.length} selected` : 'Choose at least one'}</p>
            </>
          )}

          {step.id === 'platforms' && (
            <>
              <StepHeader eyebrow="Where you post" title="Where will your content go?" subtitle="Pick all that apply. Every tool lets you choose the aspect ratio per generation." />
              <div className="flex flex-wrap gap-2.5">
                {PLATFORMS.map((platform) => <Chip key={platform.id} selected={answers.platforms.includes(platform.id)} onClick={() => toggle('platforms', platform.id)}>{platform.label}</Chip>)}
              </div>
              <div className="mt-8 rounded-[20px] border border-white/70 bg-white/70 p-5 backdrop-blur">
                <p className="text-sm font-bold">Formats Nexoclip supports</p>
                <div className="mt-4 flex items-end gap-5">
                  {[['9:16', 'h-16 w-9', 'TikTok, Reels, Shorts'], ['1:1', 'h-12 w-12', 'Feed and marketplace'], ['16:9', 'h-9 w-16', 'YouTube and web']].map(([ratio, size, use]) => (
                    <div key={ratio} className="flex flex-col items-start gap-2">
                      <span className={`${size} rounded-md border-2 border-[#A175FF] bg-[#A175FF]/10`} />
                      <span className="text-xs font-bold">{ratio}</span>
                      <span className="text-[11px] leading-tight text-[#110C2A]/50">{use}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {step.id === 'experience' && (
            <>
              <StepHeader eyebrow="Your setup" title="How familiar are you with AI tools?" subtitle="No wrong answers. It helps us understand who we are building for." />
              <div className="grid gap-3">
                {EXPERIENCE.map((level) => <OptionCard key={level.id} label={level.label} hint={level.hint} selected={answers.experience === level.id} onClick={() => choose('experience', level.id)} />)}
              </div>
              <div className="mt-9">
                <SectionLabel>How many people will use Nexoclip?</SectionLabel>
                <div className="flex flex-wrap gap-2.5">
                  {TEAM_SIZES.map((size) => <Chip key={size.id} selected={answers.teamSize === size.id} onClick={() => choose('teamSize', size.id)}>{size.label}</Chip>)}
                </div>
              </div>
            </>
          )}

          {step.id === 'source' && (
            <>
              <StepHeader eyebrow="One last thing" title="How did you hear about us?" subtitle="Optional, but it really helps a small team like ours." />
              <div className="flex flex-wrap gap-2.5">
                {SOURCES.map((source) => <Chip key={source.id} selected={answers.source === source.id} onClick={() => choose('source', source.id)}>{source.label}</Chip>)}
              </div>
            </>
          )}

          {step.id === 'tools' && (
            <>
              <StepHeader eyebrow="Your toolkit" title="Here is what you can use" subtitle="Every tool draws from the same credit balance. Based on your goals, we would start here:" />
              <div className="grid gap-3">
                {Object.entries(TOOLS).sort(([a], [b]) => (a === recommended ? -1 : b === recommended ? 1 : 0)).map(([id, tool]) => {
                  const Icon = TOOL_ICONS[id];
                  const isPick = id === recommended;
                  return (
                    <div key={id} className={`flex items-start gap-4 rounded-[20px] border p-4 ${isPick ? 'border-[#110C2A] bg-[#110C2A] text-white shadow-[0_20px_50px_-20px_rgba(17,12,42,0.6)]' : 'border-[#110C2A]/10 bg-white'}`}>
                      <span className={`grid h-11 w-11 flex-shrink-0 place-items-center rounded-[14px] ${isPick ? 'bg-[#A175FF] text-[#110C2A]' : 'bg-[#110C2A]/[.05] text-[#7d3cff]'}`}><Icon /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[15px] font-bold">{tool.label}</span>
                          {isPick && <span className="rounded-full bg-[#A175FF] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#110C2A]">Recommended for you</span>}
                        </span>
                        <span className={`mt-1 block text-[13px] leading-relaxed ${isPick ? 'text-white/70' : 'text-[#110C2A]/55'}`}>{tool.summary}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {step.id === 'credits' && (
            <>
              <StepHeader eyebrow="How credits work" title="You have 50 free credits" subtitle="Each generation uses credits based on the model, resolution and length. You always see the cost before you press Generate." />
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['about 20', 'images', 'With Nano Banana at 2.5 credits each'],
                  ['1', 'draft video', '5 seconds at 480p with Seedance 2.0'],
                  ['0', 'expiry', 'Credits never expire'],
                ].map(([value, unit, note]) => (
                  <div key={unit} className="rounded-[20px] border border-white/70 bg-white/80 p-5 backdrop-blur">
                    <p className="text-3xl font-black tracking-tight text-[#7d3cff]">{value}</p>
                    <p className="text-sm font-bold">{unit}</p>
                    <p className="mt-1.5 text-[12px] leading-snug text-[#110C2A]/50">{note}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-[20px] border border-white/70 bg-white/70 p-5 backdrop-blur">
                <p className="text-sm font-bold">Tips to make credits go further</p>
                <ul className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-[#110C2A]/65">
                  {[
                    'Start with a Draft at 480p, then render 1080p only for the take you like.',
                    'Try ideas as images first; they cost a fraction of a video.',
                    'Use Regenerate on a result instead of rebuilding the whole setup.',
                  ].map((tip) => (
                    <li key={tip} className="flex gap-2.5"><Icons.check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />{tip}</li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 flex items-start gap-4 rounded-[20px] bg-[#110C2A] p-5 text-white">
                <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-[14px] bg-[#A175FF] text-[#110C2A]"><Icons.qr /></span>
                <span>
                  <span className="block text-sm font-bold">Need more? Top up anytime</span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-white/65">Packages from Rp 249.000 for 1,250 credits, paid with QRIS or a bank virtual account. Find it under Credits → Top Up.</span>
                </span>
              </div>
            </>
          )}

          {step.id === 'done' && (
            <div className="text-center sm:pt-4">
              <div className="mx-auto mb-7 grid h-20 w-20 place-items-center rounded-full bg-emerald-500 text-white shadow-[0_20px_50px_-15px_rgba(16,185,129,0.7)]">
                <Icons.check className="h-10 w-10" />
              </div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#A175FF]">You&apos;re all set</p>
              <h1 className="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">Your studio is ready{answers.brandName.trim() ? `, ${answers.brandName.trim()}` : ''}.</h1>
              <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-[#110C2A]/60">
                We picked a starting point from your answers. Everything else is one click away in the sidebar.
              </p>
              <div className="mx-auto mt-9 max-w-md rounded-[24px] border border-[#110C2A] bg-[#110C2A] p-6 text-left text-white">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#A175FF]">Start here</p>
                <div className="mt-3 flex items-start gap-4">
                  {(() => { const Icon = TOOL_ICONS[recommended]; return <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-[16px] bg-[#A175FF] text-[#110C2A]"><Icon /></span>; })()}
                  <span>
                    <span className="block text-lg font-bold">{TOOLS[recommended].label}</span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-white/65">{TOOLS[recommended].summary}</span>
                  </span>
                </div>
              </div>
              {(answers.role || answers.goals.length > 0 || answers.platforms.length > 0) && (
                <div className="mx-auto mt-4 flex max-w-md flex-wrap justify-center gap-2">
                  {[
                    ROLES.find((role) => role.id === answers.role)?.label,
                    ...answers.goals.map((id) => GOALS.find((goal) => goal.id === id)?.label),
                    ...answers.platforms.map((id) => PLATFORMS.find((platform) => platform.id === id)?.label),
                  ].filter(Boolean).map((label) => (
                    <span key={label} className="rounded-full border border-[#110C2A]/10 bg-white/70 px-3 py-1 text-xs font-semibold text-[#110C2A]/65">{label}</span>
                  ))}
                </div>
              )}
              {error && <p role="alert" className="mx-auto mt-5 max-w-md rounded-[14px] border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>}
              <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => save('completed', TOOLS[recommended].path.startsWith('/studio') ? `${TOOLS[recommended].path}?tour=1` : TOOLS[recommended].path)} disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-[18px] bg-[#A175FF] px-5 py-3.5 text-sm font-bold text-[#110C2A] shadow-lg shadow-[#A175FF]/25 transition hover:-translate-y-0.5 hover:bg-[#9467f4] disabled:translate-y-0 disabled:opacity-60">
                  {saving ? 'Opening…' : `Open ${TOOLS[recommended].label}`}<Icons.arrow className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => save('completed', '/studio?tour=1')} disabled={saving} className="flex-1 rounded-[18px] border border-[#110C2A]/12 bg-white px-5 py-3.5 text-sm font-bold text-[#110C2A] transition hover:border-[#110C2A]/30 disabled:opacity-60">
                  Explore the Studio
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer navigation */}
      {step.id !== 'done' && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#110C2A]/[.06] bg-[#FFF6DE]/85 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
            <button
              type="button"
              onClick={back}
              disabled={stepIndex === 0}
              className="flex items-center gap-1.5 rounded-full px-3 py-2.5 text-sm font-semibold text-[#110C2A]/60 transition hover:bg-[#110C2A]/5 hover:text-[#110C2A] disabled:invisible"
            >
              <Icons.back className="h-4 w-4" />Back
            </button>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-[#110C2A]/40 sm:inline">Press Enter ↵</span>
              <button
                type="button"
                onClick={next}
                disabled={!canContinue(step.id, answers)}
                className="flex items-center gap-2 rounded-[18px] bg-[#110C2A] px-6 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#1d1640] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {nextLabel}<Icons.arrow className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
