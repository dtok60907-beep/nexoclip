'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  Camera,
  Check,
  Clapperboard,
  Clock,
  Coins,
  Compass,
  Image as ImageIcon,
  MessageSquare,
  QrCode,
  Sparkles,
  Store,
  UserRound,
  Users,
  Video,
  Workflow,
} from 'lucide-react';
import {
  CATEGORIES,
  EXPERIENCE,
  GOALS,
  PLATFORMS,
  ROLES,
  SOURCES,
  TEAM_SIZES,
  TOOLS,
  recommendTool,
} from '../../src/lib/onboarding/options.js';

// ---------------------------------------------------------------- icons ----

const ROLE_ICONS = {
  seller: Store,
  creator: Video,
  smb: Building2,
  agency: Briefcase,
  brand: Users,
  exploring: Compass,
};

const GOAL_ICONS = {
  'product-video': Video,
  'product-photo': ImageIcon,
  influencer: UserRound,
  cinematic: Camera,
  campaign: Workflow,
  ugc: MessageSquare,
};

const TOOL_ICONS = {
  canvas: Workflow,
  video: Video,
  image: ImageIcon,
  cinema: Camera,
  'ai-influencer': UserRound,
  director: Clapperboard,
};

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

const EMPTY = {
  role: null,
  brandName: '',
  category: null,
  goals: [],
  platforms: [],
  experience: null,
  teamSize: null,
  source: null,
};

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
      className={`group relative flex w-full items-start gap-3.5 rounded-2xl border p-4 text-left transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b45f2] focus-visible:ring-offset-2 ${
        selected
          ? 'border-[#5b45f2] bg-[#f6f4ff] shadow-[0_0_0_3px_rgba(91,69,242,0.12),0_10px_24px_-16px_rgba(91,69,242,0.28)]'
          : 'border-[#e7e6f0] bg-white hover:-translate-y-0.5 hover:border-[#c8bffb] hover:shadow-[0_12px_28px_-16px_rgba(20,20,38,0.16)]'
      }`}
    >
      {Icon && (
        <span
          className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl transition ${
            selected
              ? 'bg-[#5b45f2] text-white shadow-[0_6px_16px_-6px_rgba(91,69,242,0.55)]'
              : 'bg-[#f4f3f9] text-[#525263] group-hover:bg-[#f0edff] group-hover:text-[#5b45f2]'
          }`}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-snug text-[#14141f]">{label}</span>
        {hint && <span className="mt-0.5 block text-[13px] leading-snug text-[#636377]">{hint}</span>}
      </span>
      <span
        className={`mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center border transition ${
          multi ? 'rounded-[6px]' : 'rounded-full'
        } ${
          selected
            ? 'border-[#5b45f2] bg-[#5b45f2] text-white'
            : 'border-[#d4d2e0] bg-white group-hover:border-[#9e91f7]'
        }`}
      >
        {selected && <Check className="h-3 w-3" strokeWidth={2.75} aria-hidden="true" />}
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13.5px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b45f2] focus-visible:ring-offset-2 ${
        selected
          ? 'border-[#5b45f2] bg-[#5b45f2] text-white shadow-[0_6px_16px_-8px_rgba(91,69,242,0.6)]'
          : 'border-[#e5e3ef] bg-white text-[#3f3f4e] hover:border-[#c3b8fa] hover:bg-[#f8f7ff] hover:text-[#14141f]'
      }`}
    >
      {selected && <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

function StepHeader({ eyebrow, title, subtitle }) {
  return (
    <header className="mb-7">
      {eyebrow && (
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#5b45f2]">
          {eyebrow}
        </p>
      )}
      <h1 className="text-[28px] font-semibold leading-[1.16] tracking-[-0.03em] text-[#14141f] sm:text-[34px]">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-[#5e5e72]">{subtitle}</p>
      )}
    </header>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#6d6d80]">
      {children}
    </p>
  );
}

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
  const recommendedTool = TOOLS[recommended] || TOOLS.video;
  const RecommendedIcon = TOOL_ICONS[recommended] || Sparkles;
  const questionNumber = STEPS.slice(0, stepIndex + 1).filter((item) => item.question).length;

  // Only signed-in users who have not finished onboarding belong here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await fetch('/api/auth/session', { credentials: 'include' }).then((res) => res.json());
        if (!session.authenticated) return router.replace('/studio/home?auth=login&next=%2Fonboarding');
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

  // Enter moves forward (except on the final screen, which has explicit actions).
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
      <main className="grid min-h-screen place-items-center bg-[#fafafa] text-[#14141f]">
        <div className="flex flex-col items-center gap-3">
          <span
            className="h-8 w-8 animate-spin rounded-full border-[2.5px] border-[#e7e6f0] border-t-[#5b45f2]"
            aria-label="Loading"
          />
          <p className="text-[13px] font-medium text-[#71717a]">Preparing your studio setup…</p>
        </div>
      </main>
    );
  }

  const progress = Math.round((stepIndex / (STEPS.length - 1)) * 100);
  const nextLabel =
    step.id === 'welcome'
      ? "Let's get started"
      : step.id === 'source' && !answers.source
        ? 'Skip this step'
        : step.id === 'credits'
          ? 'Finish setup'
          : 'Continue';

  return (
    <main
      className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#fafafa] text-[#14141f]"
      style={{
        backgroundImage: 'radial-gradient(rgba(91,69,242,0.065) 0.75px, transparent 0.75px)',
        backgroundSize: '16px 16px',
      }}
    >
      <style>{`
        @keyframes nxo-step-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .nxo-step { animation: nxo-step-in 260ms cubic-bezier(.22,1,.36,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .nxo-step { animation: none; }
        }
      `}</style>

      {/* Subtle top-edge web-kit atmosphere */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-56"
        style={{
          background:
            'radial-gradient(ellipse 68% 70% at 50% -18%, rgba(91,69,242,0.11) 0%, rgba(124,107,247,0.04) 55%, transparent 100%)',
        }}
      />

      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-[#eceaf5] bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-4 px-5 py-3.5 sm:px-8">
          <div className="flex-shrink-0">
            <img
              src="/brand/nexoclip-lockup.png"
              alt="nexoclip"
              className="h-[23px] w-auto select-none"
            />
          </div>

          <div className="flex-1 px-1 sm:px-3">
            <div className="flex items-center justify-between text-[11.5px] font-medium text-[#6d6d80]">
              <span>
                {step.question
                  ? `Step ${questionNumber} of ${QUESTION_COUNT}`
                  : step.id === 'done'
                    ? 'Ready to create'
                    : step.id === 'welcome'
                      ? 'Studio setup'
                      : 'Studio overview'}
              </span>
              <span className="tabular-nums text-[#818193]">{progress}%</span>
            </div>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#eceaf5]"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-[#5b45f2] transition-[width] duration-300 ease-out"
                style={{ width: `${Math.max(progress, 6)}%` }}
              />
            </div>
          </div>

          {step.id !== 'done' && (
            <button
              type="button"
              onClick={() => save('skipped', '/studio')}
              disabled={saving}
              className="flex-shrink-0 rounded-xl px-3 py-1.5 text-[13px] font-medium text-[#5e5e72] transition hover:bg-[#f2f0ff] hover:text-[#14141f] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b45f2]"
            >
              Skip for now
            </button>
          )}
        </div>
      </header>

      {/* Step body */}
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pb-32 pt-9 sm:px-8 sm:pt-12">
        <div key={step.id} className="nxo-step">
          {step.id === 'welcome' && (
            <div className="text-center sm:pt-4">
              <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-[20px] border border-[#dcd6fe] bg-[#f4f2ff] text-[#5b45f2] shadow-[0_14px_34px_-14px_rgba(91,69,242,0.4)]">
                <Sparkles className="h-7 w-7" strokeWidth={1.9} aria-hidden="true" />
              </div>
              <p className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5b45f2]">
                Welcome to Nexoclip Studio
              </p>
              <h1 className="mx-auto max-w-xl text-[34px] font-semibold leading-[1.1] tracking-[-0.035em] text-[#14141f] sm:text-[44px]">
                Hi {firstName}, let&apos;s set up your studio.
              </h1>
              <p className="mx-auto mt-4 max-w-lg text-[15.5px] leading-relaxed text-[#5e5e72]">
                Answer a few quick questions so we can tailor your starting studio. It takes about two minutes, and you can switch tools anytime.
              </p>

              <div className="mx-auto mt-9 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
                {[
                  [Clock, 'About 2 minutes', `${QUESTION_COUNT} quick questions to personalize your flow`],
                  [Coins, 'One credit balance', 'Use the same credits across every creative studio'],
                  [Sparkles, 'Tailored starting point', 'We match your goals to the best first tool'],
                ].map(([Icon, title, body]) => (
                  <div
                    key={title}
                    className="rounded-2xl border border-[#e7e6f0] bg-white p-4 shadow-[0_4px_16px_-10px_rgba(20,20,38,0.08)]"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f4f2ff] text-[#5b45f2]">
                      <Icon className="h-4.5 w-4.5" strokeWidth={1.9} aria-hidden="true" />
                    </span>
                    <p className="mt-3 text-[14.5px] font-semibold text-[#14141f]">{title}</p>
                    <p className="mt-1 text-[13px] leading-snug text-[#636377]">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step.id === 'role' && (
            <>
              <StepHeader
                eyebrow="About you"
                title="What best describes you?"
                subtitle="This helps us point you to the studios and workflows that fit how you create."
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {ROLES.map((role) => (
                  <OptionCard
                    key={role.id}
                    icon={ROLE_ICONS[role.id]}
                    label={role.label}
                    hint={role.hint}
                    selected={answers.role === role.id}
                    onClick={() => choose('role', role.id)}
                  />
                ))}
              </div>
            </>
          )}

          {step.id === 'brand' && (
            <>
              <StepHeader
                eyebrow="Your brand"
                title="Tell us about what you create or sell"
                subtitle="Your brand name is optional. Picking a category helps us understand your content focus."
              />
              <div className="rounded-2xl border border-[#e7e6f0] bg-white p-5 shadow-[0_4px_18px_-12px_rgba(20,20,38,0.08)] sm:p-6">
                <label
                  htmlFor="brandName"
                  className="mb-2 block text-[13px] font-semibold text-[#292736]"
                >
                  Brand or shop name{' '}
                  <span className="font-normal text-[#818193]">(optional)</span>
                </label>
                <input
                  id="brandName"
                  value={answers.brandName}
                  onChange={(event) =>
                    setAnswers((current) => ({ ...current, brandName: event.target.value }))
                  }
                  maxLength={80}
                  placeholder="e.g. Kopi Senja, Glow Lab"
                  className="w-full rounded-xl border border-[#dfdce8] bg-[#fafafa] px-4 py-3 text-[15px] text-[#14141f] outline-none transition placeholder:text-[#8e8da0] focus:border-[#5b45f2] focus:bg-white focus:ring-4 focus:ring-[#5b45f2]/12"
                />

                <div className="mt-7 border-t border-[#efedf7] pt-6">
                  <SectionLabel>Product category</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((category) => (
                      <Chip
                        key={category.id}
                        selected={answers.category === category.id}
                        onClick={() => choose('category', category.id)}
                      >
                        {category.label}
                      </Chip>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {step.id === 'goals' && (
            <>
              <StepHeader
                eyebrow="Your goals"
                title="What do you want to create?"
                subtitle="Pick everything that applies. Your recommended starting studio comes from these."
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {GOALS.map((goal) => (
                  <OptionCard
                    key={goal.id}
                    multi
                    icon={GOAL_ICONS[goal.id]}
                    label={goal.label}
                    hint={goal.hint}
                    selected={answers.goals.includes(goal.id)}
                    onClick={() => toggle('goals', goal.id)}
                  />
                ))}
              </div>
              <p className="mt-4 text-[13px] font-medium text-[#6d6d80]">
                {answers.goals.length
                  ? `${answers.goals.length} goal${answers.goals.length > 1 ? 's' : ''} selected`
                  : 'Choose at least one to continue'}
              </p>
            </>
          )}

          {step.id === 'platforms' && (
            <>
              <StepHeader
                eyebrow="Where you publish"
                title="Where will your content go?"
                subtitle="Pick all that apply. Every studio lets you switch aspect ratios per generation."
              />
              <div className="flex flex-wrap gap-2.5">
                {PLATFORMS.map((platform) => (
                  <Chip
                    key={platform.id}
                    selected={answers.platforms.includes(platform.id)}
                    onClick={() => toggle('platforms', platform.id)}
                  >
                    {platform.label}
                  </Chip>
                ))}
              </div>

              <div className="mt-7 rounded-2xl border border-[#e7e6f0] bg-white p-5 shadow-[0_4px_18px_-12px_rgba(20,20,38,0.08)]">
                <p className="text-[14px] font-semibold text-[#14141f]">
                  Formats Nexoclip supports out of the box
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  {[
                    ['9:16', 'h-14 w-8', 'TikTok, Reels & Shorts'],
                    ['1:1', 'h-11 w-11', 'Feeds & marketplaces'],
                    ['16:9', 'h-8 w-14', 'YouTube & web hero'],
                  ].map(([ratio, size, use]) => (
                    <div
                      key={ratio}
                      className="flex items-center gap-3.5 rounded-xl border border-[#efedf7] bg-[#fafafe] p-3.5"
                    >
                      <div className="grid h-14 w-14 flex-shrink-0 place-items-center">
                        <span
                          className={`${size} rounded-md border-2 border-[#7c6bf7] bg-[#f2f0ff]`}
                          aria-hidden="true"
                        />
                      </div>
                      <div className="min-w-0">
                        <span className="block text-[14px] font-semibold tabular-nums text-[#14141f]">
                          {ratio}
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-snug text-[#636377]">
                          {use}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {step.id === 'experience' && (
            <>
              <StepHeader
                eyebrow="Your setup"
                title="How familiar are you with AI tools?"
                subtitle="No wrong answers. It helps us calibrate tips and guidance inside the Studio."
              />
              <div className="grid gap-3">
                {EXPERIENCE.map((level) => (
                  <OptionCard
                    key={level.id}
                    label={level.label}
                    hint={level.hint}
                    selected={answers.experience === level.id}
                    onClick={() => choose('experience', level.id)}
                  />
                ))}
              </div>
              <div className="mt-8 rounded-2xl border border-[#e7e6f0] bg-white p-5 shadow-[0_4px_18px_-12px_rgba(20,20,38,0.08)]">
                <SectionLabel>How many people will use Nexoclip?</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {TEAM_SIZES.map((size) => (
                    <Chip
                      key={size.id}
                      selected={answers.teamSize === size.id}
                      onClick={() => choose('teamSize', size.id)}
                    >
                      {size.label}
                    </Chip>
                  ))}
                </div>
              </div>
            </>
          )}

          {step.id === 'source' && (
            <>
              <StepHeader
                eyebrow="One last thing"
                title="How did you hear about us?"
                subtitle="Optional, but it really helps a small team like ours grow."
              />
              <div className="rounded-2xl border border-[#e7e6f0] bg-white p-5 shadow-[0_4px_18px_-12px_rgba(20,20,38,0.08)] sm:p-6">
                <div className="flex flex-wrap gap-2.5">
                  {SOURCES.map((source) => (
                    <Chip
                      key={source.id}
                      selected={answers.source === source.id}
                      onClick={() => choose('source', source.id)}
                    >
                      {source.label}
                    </Chip>
                  ))}
                </div>
              </div>
            </>
          )}

          {step.id === 'tools' && (
            <>
              <StepHeader
                eyebrow="Your toolkit"
                title="Here is what you can use"
                subtitle="Every studio draws from one shared credit balance. Based on your goals, we recommend starting here:"
              />
              <div className="grid gap-3">
                {Object.entries(TOOLS)
                  .sort(([a], [b]) => (a === recommended ? -1 : b === recommended ? 1 : 0))
                  .map(([id, tool]) => {
                    const Icon = TOOL_ICONS[id] || Sparkles;
                    const isPick = id === recommended;
                    return (
                      <div
                        key={id}
                        className={`flex items-start gap-4 rounded-2xl border p-4 transition ${
                          isPick
                            ? 'border-[#5b45f2] bg-[#f6f4ff] shadow-[0_12px_28px_-18px_rgba(91,69,242,0.35)]'
                            : 'border-[#e7e6f0] bg-white'
                        }`}
                      >
                        <span
                          className={`grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl ${
                            isPick
                              ? 'bg-[#5b45f2] text-white'
                              : 'bg-[#f4f3f9] text-[#5b45f2]'
                          }`}
                        >
                          <Icon className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-[15px] font-semibold text-[#14141f]">
                              {tool.label}
                            </span>
                            {isPick && (
                              <span className="rounded-full bg-[#5b45f2] px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-white">
                                Recommended for you
                              </span>
                            )}
                          </span>
                          <span className="mt-1 block text-[13.5px] leading-relaxed text-[#5e5e72]">
                            {tool.summary}
                          </span>
                        </span>
                      </div>
                    );
                  })}
              </div>
            </>
          )}

          {step.id === 'credits' && (
            <>
              <StepHeader
                eyebrow="How credits work"
                title="One balance for every studio"
                subtitle="Each run uses credits based on model, resolution, and duration. You always see the exact price before clicking Generate."
              />
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['± 6', 'credits per image', 'With Nano Banana'],
                  ['± 101', 'credits per video', '5 seconds with Kling 3'],
                  ['0', 'expiry', 'Credits never expire'],
                ].map(([value, unit, note]) => (
                  <div
                    key={unit}
                    className="rounded-2xl border border-[#e7e6f0] bg-white p-5 shadow-[0_4px_16px_-12px_rgba(20,20,38,0.08)]"
                  >
                    <p className="text-[30px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[#5b45f2]">
                      {value}
                    </p>
                    <p className="mt-2 text-[14px] font-semibold text-[#14141f]">{unit}</p>
                    <p className="mt-1 text-[12.5px] leading-snug text-[#6d6d80]">{note}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-[#e7e6f0] bg-white p-5">
                <p className="text-[14px] font-semibold text-[#14141f]">
                  Tips to make credits go further
                </p>
                <ul className="mt-3 space-y-2.5 text-[13.5px] leading-relaxed text-[#525263]">
                  {[
                    'Start with a draft at 480p, then render 1080p only for the take you love.',
                    'Explore ideas as images first; they cost a small fraction of a video.',
                    'Use Regenerate on a result instead of rebuilding your whole setup.',
                  ].map((tip) => (
                    <li key={tip} className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-[#ecfdf3] text-[#16794c]">
                        <Check className="h-3 w-3" strokeWidth={2.75} aria-hidden="true" />
                      </span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-4 flex items-start gap-4 rounded-2xl border border-[#dcd6fe] bg-[#f6f4ff] p-5">
                <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-[#5b45f2] text-white">
                  <QrCode className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
                </span>
                <div>
                  <span className="block text-[14.5px] font-semibold text-[#14141f]">
                    Top up anytime with QRIS or Virtual Account
                  </span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-[#525263]">
                    Packages start from Rp 229.000 for 1.200 credits, paid seamlessly via QRIS or bank VA. Find it anytime under Usage &amp; Billing → Top Up.
                  </span>
                </div>
              </div>
            </>
          )}

          {step.id === 'done' && (
            <div className="text-center sm:pt-4">
              <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full bg-[#5b45f2] text-white shadow-[0_18px_40px_-14px_rgba(91,69,242,0.55)]">
                <Check className="h-8 w-8" strokeWidth={2.5} aria-hidden="true" />
              </div>
              <p className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5b45f2]">
                You&apos;re all set
              </p>
              <h1 className="mx-auto max-w-xl text-[34px] font-semibold leading-[1.1] tracking-[-0.035em] text-[#14141f] sm:text-[42px]">
                Your studio is ready{answers.brandName.trim() ? `, ${answers.brandName.trim()}` : ''}.
              </h1>
              <p className="mx-auto mt-3.5 max-w-md text-[15px] leading-relaxed text-[#5e5e72]">
                We picked a starting studio based on your answers. Every other tool is one click away in the sidebar.
              </p>

              <div className="mx-auto mt-8 max-w-md rounded-2xl border border-[#dcd6fe] bg-white p-5 text-left shadow-[0_18px_42px_-20px_rgba(24,18,66,0.18)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5b45f2]">
                  Recommended starting point
                </p>
                <div className="mt-3 flex items-start gap-3.5">
                  <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-xl bg-[#5b45f2] text-white shadow-[0_8px_20px_-8px_rgba(91,69,242,0.55)]">
                    <RecommendedIcon className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <span className="block text-[17px] font-semibold text-[#14141f]">
                      {recommendedTool.label}
                    </span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-[#5e5e72]">
                      {recommendedTool.summary}
                    </span>
                  </div>
                </div>
              </div>

              {(answers.role || answers.goals.length > 0 || answers.platforms.length > 0) && (
                <div className="mx-auto mt-4 flex max-w-md flex-wrap justify-center gap-1.5">
                  {[
                    ROLES.find((role) => role.id === answers.role)?.label,
                    ...answers.goals.map((id) => GOALS.find((goal) => goal.id === id)?.label),
                    ...answers.platforms.map((id) => PLATFORMS.find((platform) => platform.id === id)?.label),
                  ]
                    .filter(Boolean)
                    .map((label) => (
                      <span
                        key={label}
                        className="rounded-full border border-[#e7e6f0] bg-white px-3 py-1 text-[12px] font-medium text-[#525263]"
                      >
                        {label}
                      </span>
                    ))}
                </div>
              )}

              {error && (
                <p
                  role="alert"
                  className="mx-auto mt-5 max-w-md rounded-xl border border-[#f2cbd4] bg-[#fff4f6] px-4 py-2.5 text-[13.5px] font-medium text-[#9c243f]"
                >
                  {error}
                </p>
              )}

              <div className="mx-auto mt-7 flex max-w-md flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() =>
                    save(
                      'completed',
                      recommendedTool.path.startsWith('/studio')
                        ? `${recommendedTool.path}?tour=1`
                        : recommendedTool.path,
                    )
                  }
                  disabled={saving}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#5b45f2] px-5 py-3 text-[14px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(91,69,242,0.55)] transition hover:bg-[#4731d8] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b45f2] focus-visible:ring-offset-2"
                >
                  {saving ? 'Opening…' : `Open ${recommendedTool.label}`}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => save('completed', '/studio?tour=1')}
                  disabled={saving}
                  className="flex-1 rounded-xl border border-[#e3e1ee] bg-white px-5 py-3 text-[14px] font-semibold text-[#14141f] transition hover:border-[#c8bffb] hover:bg-[#f8f7ff] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b45f2] focus-visible:ring-offset-2"
                >
                  Explore the Studio
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer navigation */}
      {step.id !== 'done' && (
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-[#eceaf5] bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-5 py-3.5 sm:px-8">
            <button
              type="button"
              onClick={back}
              disabled={stepIndex === 0}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13.5px] font-medium text-[#5e5e72] transition hover:bg-[#f4f3f9] hover:text-[#14141f] disabled:invisible focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b45f2]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>

            <div className="flex items-center gap-3">
              <span className="hidden text-[12px] text-[#818193] sm:inline">Press Enter ↵</span>
              <button
                type="button"
                onClick={next}
                disabled={!canContinue(step.id, answers)}
                className="inline-flex items-center gap-2 rounded-xl bg-[#5b45f2] px-5 py-2.5 text-[14px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(91,69,242,0.5)] transition hover:bg-[#4731d8] disabled:cursor-not-allowed disabled:bg-[#eceaf5] disabled:text-[#9898aa] disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b45f2] focus-visible:ring-offset-2"
              >
                {nextLabel}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </footer>
      )}
    </main>
  );
}
