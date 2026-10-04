// Shared layout and styles for the sign-in and sign-up pages: a brand panel
// on the left (desktop only) and the form card on the right.

export const inputClass =
  'w-full rounded-[18px] border border-[#110C2A]/10 bg-white px-4 py-3.5 text-sm text-[#110C2A] placeholder:text-[#110C2A]/35 outline-none transition focus:border-[#A175FF] focus:ring-4 focus:ring-[#A175FF]/15 disabled:opacity-60';
export const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-[#110C2A]/55';
export const primaryButtonClass =
  'w-full rounded-[18px] bg-[#A175FF] px-4 py-3.5 text-sm font-bold text-[#110C2A] shadow-lg shadow-[#A175FF]/25 transition hover:-translate-y-0.5 hover:bg-[#9467f4] disabled:translate-y-0 disabled:opacity-60';
export const secondaryButtonClass =
  'block w-full rounded-[18px] border border-[#110C2A]/12 bg-white px-4 py-3.5 text-center text-sm font-bold text-[#110C2A] transition hover:-translate-y-0.5 hover:border-[#A175FF]/60 hover:text-[#7d3cff]';

export const CheckIcon = ({ className = '' }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </svg>
);

const EyeIcon = ({ open }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {!open && <path d="M3 3l18 18" />}
  </svg>
);

export function PasswordToggle({ shown, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? 'Hide password' : 'Show password'}
      className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-[#110C2A]/45 transition hover:bg-[#110C2A]/5 hover:text-[#110C2A]"
    >
      <EyeIcon open={shown} />
    </button>
  );
}

export function AuthAlert({ children }) {
  return <div role="alert" className="mt-6 rounded-[14px] border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{children}</div>;
}

export function AuthDivider({ children }) {
  return (
    <div className="mt-6 flex items-center gap-3 text-xs text-[#110C2A]/40">
      <span className="h-px flex-1 bg-[#110C2A]/10" />
      {children}
      <span className="h-px flex-1 bg-[#110C2A]/10" />
    </div>
  );
}

export function AuthLegal({ action }) {
  return (
    <p className="mt-5 text-center text-xs leading-5 text-[#110C2A]/45">
      By {action} you agree to our{' '}
      <a href="https://www.nexoclip.com/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-black/70">Terms of use</a>{' '}&amp;{' '}
      <a href="https://www.nexoclip.com/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-black/70">Privacy Policy</a>.
    </p>
  );
}

const TOOLS = ['Canvas', 'Video Studio', 'Image Studio', 'Cinema', 'AI Influencer'];

export default function AuthShell({ headline, subtitle, points, eyebrow, title, description, children }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#FFF6DE] text-[#110C2A]">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#A175FF]/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-[#8BDFDD]/35 blur-3xl" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-[1fr_minmax(0,440px)] lg:gap-16 lg:px-8">
        <section className="relative hidden overflow-hidden rounded-[40px] bg-[#110C2A] p-10 text-white shadow-[0_24px_80px_rgba(17,12,42,0.25)] lg:block xl:p-12">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#A175FF]/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-10 h-60 w-60 rounded-full bg-[#8BDFDD]/20 blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-[16px] bg-[#A175FF] text-lg font-black text-[#110C2A]">N</div>
              <span className="text-lg font-bold tracking-tight">Nexoclip</span>
            </div>
            <h2 className="mt-12 text-4xl font-black leading-[1.05] tracking-tight xl:text-5xl">{headline}</h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/70">{subtitle}</p>
            <ul className="mt-10 space-y-5">
              {points.map((point) => (
                <li key={point.title} className="flex gap-4">
                  <span className="mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-[#A175FF]/20 text-[#C9B0FF]">
                    <CheckIcon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block font-bold">{point.title}</span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-white/60">{point.body}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-12 flex flex-wrap gap-2">
              {TOOLS.map((tool) => (
                <span key={tool} className="rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 text-xs font-semibold text-white/75">{tool}</span>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md rounded-[40px] border border-white/70 bg-white/75 p-7 shadow-[0_24px_80px_rgba(17,12,42,0.12)] backdrop-blur-xl sm:p-9">
          <div className="mb-5 flex justify-center lg:hidden">
            <div className="grid h-12 w-12 place-items-center rounded-[18px] bg-[#110C2A] text-lg font-black text-[#A175FF] shadow-lg shadow-[#A175FF]/20">N</div>
          </div>
          <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.2em] text-[#A175FF] lg:text-left">{eyebrow}</p>
          <h1 className="text-center text-3xl font-black tracking-tight lg:text-left">{title}</h1>
          <p className="mt-2 text-center text-sm text-[#110C2A]/60 lg:text-left">{description}</p>
          {children}
        </section>
      </div>
    </main>
  );
}
