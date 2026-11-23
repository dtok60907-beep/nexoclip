'use client';

/**
 * NexoClip Loading & Skeleton System
 * Branded LoaderGooeyBlobs + structured page/component skeletons.
 */

import { LoaderGooeyBlobs } from './loader-gooey-blobs';

export { LoaderGooeyBlobs };

export function NxSkeleton({
  className = '',
  variant = 'rect',
  strong = false,
  width,
  height,
  style,
}) {
  const variantClass =
    variant === 'circle'
      ? 'nx-skel--circle'
      : variant === 'pill'
      ? 'nx-skel--pill'
      : variant === 'media'
      ? 'nx-skel--media'
      : '';
  return (
    <span
      aria-hidden="true"
      className={`nx-skel ${variantClass} ${strong ? 'nx-skel--strong' : ''} ${className}`.trim()}
      style={{ width, height, ...style }}
    />
  );
}

export function NxInlineSpinner({ className = '', size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={`nx-inline-spinner ${className}`.trim()}
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.75" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function NxBrandLoader({
  label = 'Nexoclip Studio',
  sublabel = 'Preparing your creative workspace',
  fullScreen = false,
  surface = 'light',
  size = 18,
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-nx-surface={surface}
      className={`nx-brand-loader${fullScreen ? ' is-fullscreen' : ''}${surface === 'dark' ? ' nx-surface-dark' : ''}`}
    >
      <div className="nx-brand-loader-card">
        <div className="nx-brand-gooey-wrap" aria-hidden="true">
          <LoaderGooeyBlobs
            size={size}
            color="var(--nx-load-accent)"
            duration={1.5}
          />
        </div>

        {(label || sublabel) && (
          <div className="nx-brand-copy">
            {label ? <p className="nx-brand-title">{label}</p> : null}
            {sublabel ? <p className="nx-brand-sub">{sublabel}</p> : null}
          </div>
        )}
      </div>
    </div>
  );
}

export function NxStudioSkeleton({
  label = 'Loading Studio',
  route = false,
  surface = 'light',
  variant = 'split',
}) {
  const isCanvas = variant === 'canvas';
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      data-nx-surface={surface}
      className={`nx-studio-skel${route ? ' is-route' : ''}${isCanvas ? ' is-canvas' : ''}${surface === 'dark' ? ' nx-surface-dark' : ''}`}
    >
      {route && (
        <aside className="nx-studio-skel-rail" aria-hidden="true">
          <NxSkeleton width={34} height={34} style={{ borderRadius: 10 }} strong />
          <div className="nx-studio-skel-rail-divider" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%' }}>
            {[0, 1, 2, 3, 4].map((idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <NxSkeleton width={36} height={30} style={{ borderRadius: 10 }} strong={idx === 0} />
                <NxSkeleton width={30} height={7} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <NxSkeleton width={34} height={34} style={{ borderRadius: 10 }} />
            <NxSkeleton width={34} height={34} style={{ borderRadius: 10 }} />
            <NxSkeleton variant="circle" width={30} height={30} strong />
          </div>
        </aside>
      )}

      <div className="nx-studio-skel-body">
        {isCanvas ? (
          <div className="nx-studio-skel-canvas-mode">
            <div className="nx-studio-skel-canvas-top">
              <div className="nx-studio-skel-status-pill">
                <LoaderGooeyBlobs size={7} color="var(--nx-load-accent)" duration={1.4} className="nx-skel-gooey" />
                <span>{label}</span>
              </div>
            </div>

            <div className="nx-studio-skel-canvas-center" aria-hidden="true">
              <NxSkeleton variant="pill" width={168} height={26} />
              <NxSkeleton width={320} height={38} strong style={{ maxWidth: '84%', marginTop: 14, borderRadius: 10 }} />
              <NxSkeleton width={430} height={14} style={{ maxWidth: '90%', marginTop: 12 }} />
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 22, maxWidth: 620 }}>
                <NxSkeleton variant="pill" width={190} height={32} />
                <NxSkeleton variant="pill" width={210} height={32} />
                <NxSkeleton variant="pill" width={175} height={32} />
              </div>
            </div>

            <div className="nx-studio-skel-canvas-composer" aria-hidden="true">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <NxSkeleton width={40} height={40} style={{ borderRadius: 12 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <NxSkeleton width="66%" height={14} />
                  <NxSkeleton width="42%" height={12} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 12, borderTop: '1px solid var(--nx-load-border)' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <NxSkeleton width={128} height={34} style={{ borderRadius: 11 }} />
                  <NxSkeleton width={68} height={34} style={{ borderRadius: 11 }} />
                  <NxSkeleton width={76} height={34} style={{ borderRadius: 11 }} />
                </div>
                <NxSkeleton variant="pill" width={128} height={38} strong />
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="nx-studio-skel-topbar">
              <div className="nx-studio-skel-status">
                <LoaderGooeyBlobs size={8} color="var(--nx-load-accent)" duration={1.4} className="nx-skel-gooey" />
                <span>{label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} aria-hidden="true">
                <NxSkeleton variant="pill" width={72} height={28} />
                <NxSkeleton variant="pill" width={92} height={28} />
              </div>
            </div>

            <div className="nx-studio-skel-grid" aria-hidden="true">
              <div className="nx-studio-skel-controls">
                <NxSkeleton width="52%" height={12} />
                <NxSkeleton height={40} />
                <NxSkeleton width="44%" height={12} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <NxSkeleton height={36} />
                  <NxSkeleton height={36} />
                </div>
                <NxSkeleton width="58%" height={12} />
                <NxSkeleton height={112} variant="media" />
                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <NxSkeleton height={36} />
                  <NxSkeleton height={42} variant="pill" strong />
                </div>
              </div>

              <div className="nx-studio-skel-stage">
                <div className="nx-studio-skel-canvas">
                  <NxSkeleton variant="media" style={{ aspectRatio: '16 / 10' }} />
                  <NxSkeleton variant="media" style={{ aspectRatio: '16 / 10' }} />
                  <NxSkeleton variant="media" style={{ aspectRatio: '16 / 10' }} />
                  <NxSkeleton variant="media" style={{ aspectRatio: '16 / 10' }} />
                </div>
                <div className="nx-studio-skel-prompt">
                  <NxSkeleton width="62%" height={16} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <NxSkeleton variant="pill" width={64} height={32} />
                    <NxSkeleton variant="pill" width={88} height={32} strong />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function NxCardGridSkeleton({ kind = 'media', count = 6 }) {
  const isProjects = kind === 'projects';
  return (
    <div role="status" aria-live="polite" aria-label={isProjects ? 'Loading projects' : 'Loading media library'}>
      <span className="sr-only">{isProjects ? 'Loading projects…' : 'Loading workspace media…'}</span>
      {isProjects && (
        <div aria-hidden="true" style={{ marginBottom: 24 }}>
          <NxSkeleton width={76} height={15} strong style={{ marginBottom: 12 }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <NxSkeleton width={132} height={38} style={{ borderRadius: 10 }} />
            <NxSkeleton width={156} height={38} style={{ borderRadius: 10 }} />
            <NxSkeleton width={120} height={38} style={{ borderRadius: 10 }} />
          </div>
          <NxSkeleton width={82} height={15} strong style={{ marginTop: 28, marginBottom: 12 }} />
        </div>
      )}
      <div className={isProjects ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'nx-library-grid'} aria-hidden="true">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="nx-skel-card" style={isProjects ? { padding: 0, overflow: 'hidden' } : undefined}>
            {isProjects ? (
              <>
                <NxSkeleton variant="media" style={{ aspectRatio: '16 / 9', borderRadius: 0 }} />
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <NxSkeleton width={72} height={10} />
                  <NxSkeleton width="78%" height={15} strong />
                  <NxSkeleton width="52%" height={11} />
                </div>
              </>
            ) : (
              <>
                <NxSkeleton variant="media" height={150} />
                <NxSkeleton width="76%" height={14} />
                <NxSkeleton width="42%" height={11} />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function NxUsageSkeleton() {
  return (
    <main className="nx-ub-page" role="status" aria-live="polite" aria-label="Loading usage">
      <span className="sr-only">Loading usage…</span>
      <div className="nx-ub-container" aria-hidden="true">
        <div className="nx-ub-header">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <NxSkeleton width={178} height={28} strong />
            <NxSkeleton width={290} height={14} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <NxSkeleton variant="pill" width={250} height={38} />
            <NxSkeleton variant="pill" width={138} height={38} strong />
          </div>
        </div>

        {/* 4-column metric strip skeleton */}
        <div className="nx-ub-card nx-ub-kpi-strip">
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className="nx-ub-kpi-cell">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <NxSkeleton width={34} height={34} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                  <NxSkeleton width="68%" height={13} strong />
                  <NxSkeleton width="52%" height={11} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <NxSkeleton width={92} height={24} strong />
                  <NxSkeleton width={104} height={11} />
                </div>
                <NxSkeleton width={88} height={22} />
              </div>
            </div>
          ))}
        </div>

        {/* 3-panel mid bento skeleton */}
        <div className="nx-ub-mid-grid">
          <div className="nx-ub-card nx-ub-panel" style={{ gap: 12 }}>
            <NxSkeleton width={140} height={15} strong />
            <NxSkeleton width={120} height={11} />
            {[0, 1, 2].map((idx) => (
              <div key={idx} className="nx-ub-insight-item">
                <NxSkeleton width={100} height={11} />
                <NxSkeleton width={68} height={22} strong />
              </div>
            ))}
          </div>

          <div className="nx-ub-card nx-ub-panel" style={{ gap: 12 }}>
            <NxSkeleton width={142} height={15} strong />
            <NxSkeleton width={164} height={11} />
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0' }}>
                <NxSkeleton width={52} height={11} />
                <NxSkeleton width="48%" height={13} />
                <NxSkeleton variant="pill" width={64} height={22} />
              </div>
            ))}
          </div>

          <div className="nx-ub-card nx-ub-panel" style={{ gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <NxSkeleton width={146} height={15} strong />
                <NxSkeleton width={170} height={11} />
              </div>
              <NxSkeleton variant="pill" width={86} height={28} />
            </div>
            <NxSkeleton variant="media" height={198} />
          </div>
        </div>

        {/* Bottom 2-panel bento skeleton */}
        <div className="nx-ub-bottom-grid">
          <div className="nx-ub-card nx-ub-panel" style={{ gap: 14 }}>
            <NxSkeleton width={136} height={15} strong />
            <NxSkeleton width={170} height={28} strong />
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <NxSkeleton width="38%" height={13} />
                <NxSkeleton width="18%" height={13} />
                <NxSkeleton width="16%" height={13} />
              </div>
            ))}
          </div>
          <div className="nx-ub-card nx-ub-panel" style={{ gap: 14 }}>
            <NxSkeleton width={120} height={15} strong />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, alignItems: 'end', flex: 1, minHeight: 160 }}>
              <NxSkeleton variant="media" height={110} strong />
              <NxSkeleton variant="media" height={72} />
              <NxSkeleton variant="media" height={42} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export function NxBillingPlansSkeleton({ count = 3 }) {
  return (
    <section className="nx-bill-section" role="status" aria-live="polite" aria-label="Loading subscription plans">
      <span className="sr-only">Loading subscription plans…</span>
      <div aria-hidden="true">
        <div className="nx-bill-section-head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <NxSkeleton width={128} height={12} />
            <NxSkeleton width={210} height={24} strong />
            <NxSkeleton width={340} height={13} />
          </div>
          <NxSkeleton variant="pill" width={226} height={42} />
        </div>
        <div className="nx-bill-grid">
          {Array.from({ length: count }).map((_, idx) => (
            <div key={idx} className="nx-bill-card" style={{ padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <NxSkeleton width={96} height={20} strong />
                {idx === 1 ? <NxSkeleton variant="pill" width={88} height={22} /> : null}
              </div>
              <NxSkeleton width="92%" height={12} style={{ marginTop: 10 }} />
              <NxSkeleton width="68%" height={12} style={{ marginTop: 6 }} />
              <NxSkeleton width={156} height={32} strong style={{ marginTop: 18 }} />
              <NxSkeleton width={120} height={12} style={{ marginTop: 8 }} />
              <NxSkeleton variant="pill" height={42} strong style={{ marginTop: 18 }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 16 }}>
                <NxSkeleton height={48} />
                <NxSkeleton height={48} />
                <NxSkeleton height={48} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
                <NxSkeleton height={12} width="82%" />
                <NxSkeleton height={12} width="74%" />
                <NxSkeleton height={12} width="88%" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function NxBillingTopupsSkeleton({ count = 3 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="nx-bill-card" style={{ padding: 22 }} aria-hidden="true">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <NxSkeleton width={108} height={20} strong />
            <NxSkeleton variant="pill" width={72} height={22} />
          </div>
          <NxSkeleton width="88%" height={12} style={{ marginTop: 10 }} />
          <NxSkeleton width={144} height={32} strong style={{ marginTop: 20 }} />
          <NxSkeleton width={124} height={12} style={{ marginTop: 8 }} />
          <NxSkeleton variant="pill" height={42} strong style={{ marginTop: 18 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 16 }}>
            <NxSkeleton height={48} />
            <NxSkeleton height={48} />
            <NxSkeleton height={48} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16 }}>
            <NxSkeleton variant="pill" width={68} height={22} />
            <NxSkeleton variant="pill" width={82} height={22} />
            <NxSkeleton variant="pill" width={74} height={22} />
            <NxSkeleton variant="pill" width={64} height={22} />
          </div>
        </div>
      ))}
    </>
  );
}

export function NxPricingModalSkeleton({ count = 3 }) {
  return (
    <div className="nx-pm-grid" role="status" aria-live="polite" aria-label="Loading pricing options">
      <span className="sr-only">Loading pricing options…</span>
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="nx-pm-card" aria-hidden="true">
          <div className="nx-pm-card-head">
            <NxSkeleton width={88} height={22} strong />
            {idx === 1 ? <NxSkeleton variant="pill" width={92} height={22} /> : null}
          </div>
          <NxSkeleton width="86%" height={13} style={{ marginTop: 10 }} />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 22 }}>
            <NxSkeleton width={136} height={34} strong />
            <NxSkeleton width={38} height={14} />
          </div>
          <NxSkeleton width={116} height={12} style={{ marginTop: 8 }} />
          <NxSkeleton variant="pill" height={42} strong style={{ marginTop: 20, borderRadius: 11 }} />
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 11 }}>
            <NxSkeleton width={96} height={10} />
            <NxSkeleton width="84%" height={13} />
            <NxSkeleton width="76%" height={13} />
            <NxSkeleton width="88%" height={13} />
            <NxSkeleton width="72%" height={13} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function NxBillingSummarySkeleton() {
  return (
    <div className="nx-ub-card nx-bill-summary-card" role="status" aria-live="polite" aria-label="Loading billing summary">
      <span className="sr-only">Loading billing summary…</span>
      <div className="nx-bill-summary-cell" aria-hidden="true">
        <NxSkeleton width={84} height={11} />
        <NxSkeleton width={148} height={22} strong style={{ marginTop: 8 }} />
        <NxSkeleton width={180} height={12} style={{ marginTop: 8 }} />
      </div>
      <div className="nx-bill-summary-cell" aria-hidden="true">
        <NxSkeleton width={98} height={11} />
        <NxSkeleton width={128} height={22} strong style={{ marginTop: 8 }} />
        <NxSkeleton width={156} height={12} style={{ marginTop: 8 }} />
      </div>
      <div className="nx-bill-summary-actions" aria-hidden="true">
        <NxSkeleton variant="pill" width={108} height={38} />
        <NxSkeleton variant="pill" width={138} height={38} strong />
      </div>
    </div>
  );
}

export function NxBillingHistoryRowsSkeleton({ rows = 3 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, idx) => (
        <tr key={idx} aria-hidden="true">
          <td><NxSkeleton width={124} height={13} /></td>
          <td><NxSkeleton width={92} height={13} /></td>
          <td><NxSkeleton width={82} height={13} /></td>
          <td><NxSkeleton width={60} height={13} /></td>
          <td><NxSkeleton variant="pill" width={76} height={22} /></td>
          <td style={{ textAlign: 'right' }}><NxSkeleton width={56} height={13} style={{ marginLeft: 'auto' }} /></td>
        </tr>
      ))}
    </>
  );
}

export function NxSocialMediaSkeleton({ type = 'video' }) {
  if (type === 'photo') {
    return (
      <div role="status" aria-live="polite" aria-label="Loading workspace photos" className="mt-5">
        <span className="sr-only">Loading workspace photos…</span>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-hidden="true">
          {Array.from({ length: 10 }).map((_, idx) => (
            <NxSkeleton key={idx} variant="media" style={{ aspectRatio: '1 / 1' }} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" aria-label="Loading workspace videos" className="mt-5">
      <span className="sr-only">Loading workspace videos…</span>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="nx-skel-card" style={{ padding: 10 }}>
            <NxSkeleton variant="media" style={{ aspectRatio: '16 / 10' }} />
            <NxSkeleton width="76%" height={13} />
            <NxSkeleton width="44%" height={11} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function NxHistoryListSkeleton({ count = 3 }) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading publishing history" className="mt-4 space-y-3">
      <span className="sr-only">Loading publishing history…</span>
      <div aria-hidden="true" className="space-y-3">
        {Array.from({ length: count }).map((_, idx) => (
          <div key={idx} className="nx-skel-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <NxSkeleton width={210} height={15} strong />
              <NxSkeleton variant="pill" width={78} height={22} />
            </div>
            <NxSkeleton width="82%" height={13} />
            <NxSkeleton width={136} height={11} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function NxAdsManagerSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading Meta ad data" className="mt-6 space-y-6">
      <span className="sr-only">Loading Meta ad data…</span>
      <div aria-hidden="true" className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="nx-skel-card">
              <NxSkeleton width={76} height={12} />
              <NxSkeleton width={116} height={24} strong />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {[0, 1].map((idx) => (
            <div key={idx} className="nx-skel-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <NxSkeleton width={190} height={16} strong />
                  <NxSkeleton width={260} height={12} />
                </div>
                <NxSkeleton variant="pill" width={104} height={36} />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
                <NxSkeleton height={13} width="72%" />
                <NxSkeleton height={13} width="64%" />
                <NxSkeleton height={13} width="68%" />
                <NxSkeleton height={13} width="56%" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function NxDirectorSkeleton({
  label = 'Loading AI Director',
  surface = 'light',
  variant = 'full',
}) {
  const isDark = surface === 'dark';

  if (variant === 'project') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={label}
        data-nx-surface={surface}
        className={`nx-dir-skel-project${isDark ? ' nx-surface-dark' : ''}`}
      >
        <div className="nx-dir-skel-topbar">
          <span className="nx-dir-skel-status">
            <LoaderGooeyBlobs size={7} color="var(--nx-load-accent)" duration={1.4} className="nx-skel-gooey" />
            <span>{label}</span>
          </span>
          <div className="nx-dir-skel-top-actions" aria-hidden="true">
            <NxSkeleton variant="pill" width={78} height={30} />
            <NxSkeleton variant="circle" width={30} height={30} />
          </div>
        </div>

        <div className="nx-dir-skel-stream" aria-hidden="true">
          <div className="nx-dir-skel-agent">
            <NxSkeleton width={44} height={44} style={{ borderRadius: 16 }} strong />
            <NxSkeleton width={92} height={14} strong style={{ marginTop: 10 }} />
            <NxSkeleton width={164} height={11} style={{ marginTop: 6 }} />
          </div>

          <div className="nx-dir-skel-msg is-user">
            <NxSkeleton width="88%" height={12} />
            <NxSkeleton width="58%" height={12} />
          </div>

          <div className="nx-dir-skel-step">
            <NxSkeleton variant="circle" width={14} height={14} />
            <NxSkeleton width={156} height={11} />
          </div>

          <div className="nx-dir-skel-msg is-assistant">
            <NxSkeleton width="92%" height={12} />
            <NxSkeleton width="84%" height={12} />
            <NxSkeleton width="62%" height={12} />
          </div>

          <div className="nx-dir-skel-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                <NxSkeleton width={32} height={32} style={{ borderRadius: 10 }} strong />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                  <NxSkeleton width="42%" height={13} strong />
                  <NxSkeleton width="68%" height={11} />
                </div>
              </div>
              <NxSkeleton variant="pill" width={92} height={32} strong />
            </div>
          </div>
        </div>

        <div className="nx-dir-skel-composer-wrap" aria-hidden="true">
          <div className="nx-dir-skel-pill-composer">
            <NxSkeleton variant="circle" width={30} height={30} />
            <NxSkeleton width="64%" height={14} />
            <NxSkeleton variant="circle" width={30} height={30} strong style={{ marginLeft: 'auto' }} />
          </div>
          <div className="nx-dir-skel-meta-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <NxSkeleton variant="pill" width={68} height={14} />
              <NxSkeleton variant="pill" width={128} height={22} />
            </div>
            <NxSkeleton variant="pill" width={68} height={16} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      data-nx-surface={surface}
      className={`nx-director-skel${isDark ? ' nx-surface-dark' : ''}`}
    >
      <aside className="nx-director-skel-side" aria-hidden="true">
        <div className="nx-director-skel-side-head">
          <NxSkeleton height={34} style={{ flex: 1, borderRadius: 12 }} strong />
          <NxSkeleton width={28} height={28} style={{ borderRadius: 8 }} />
        </div>

        <div className="nx-director-skel-side-actions">
          <NxSkeleton variant="pill" width={72} height={30} strong />
          <div style={{ display: 'flex', gap: 4 }}>
            <NxSkeleton width={26} height={26} style={{ borderRadius: 8 }} />
            <NxSkeleton width={26} height={26} style={{ borderRadius: 8 }} />
          </div>
        </div>

        <div className="nx-director-skel-side-list">
          <NxSkeleton width={56} height={10} style={{ marginBottom: 4 }} />
          <NxSkeleton height={30} style={{ borderRadius: 9 }} />
          <NxSkeleton width="88%" height={30} style={{ borderRadius: 9 }} />
          <NxSkeleton width="76%" height={30} style={{ borderRadius: 9 }} />
          <NxSkeleton width="92%" height={30} style={{ borderRadius: 9 }} />
          <NxSkeleton width="68%" height={30} style={{ borderRadius: 9 }} />
        </div>
      </aside>

      <div className="nx-director-skel-hero">
        <div className="nx-director-skel-hero-top">
          <span className="nx-director-skel-status-pill">
            <LoaderGooeyBlobs size={7} color={isDark ? 'var(--nx-load-accent)' : '#5b45f2'} duration={1.4} className="nx-skel-gooey" />
            <span>{label}</span>
          </span>
        </div>

        <div className="nx-director-skel-hero-inner" aria-hidden="true">
          <NxSkeleton variant="pill" width={226} height={42} className="nx-dir-skel-on-hero" />
          <NxSkeleton width={420} height={38} className="nx-dir-skel-on-hero" style={{ maxWidth: '88%', marginTop: 22, borderRadius: 10 }} />

          <div className="nx-director-skel-composer-card">
            <NxSkeleton width="76%" height={18} />
            <NxSkeleton width="48%" height={14} style={{ marginTop: 10 }} />
            <div className="nx-director-skel-composer-foot">
              <NxSkeleton width={36} height={36} style={{ borderRadius: 8 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <NxSkeleton width={104} height={36} style={{ borderRadius: 8 }} />
                <NxSkeleton width={36} height={36} style={{ borderRadius: 8 }} strong />
              </div>
            </div>
          </div>

          <div className="nx-director-skel-ideas">
            {[136, 136, 224, 136, 136, 200].map((w, idx) => (
              <div key={idx} className="nx-director-skel-idea-card" style={{ flexBasis: w }}>
                <NxSkeleton variant="media" style={{ height: 220, width: '100%', borderRadius: 14 }} />
                <NxSkeleton width="72%" height={12} style={{ marginTop: 2 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function NxAccountSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading settings"
      data-nx-surface="light"
      className="space-y-5"
    >
      <span className="sr-only">Loading settings…</span>
      <div aria-hidden="true" className="space-y-5">
        <div className="nx-set-header" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <NxSkeleton width={132} height={28} strong />
            <NxSkeleton width={320} height={14} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <NxSkeleton variant="pill" width={138} height={38} strong />
            <NxSkeleton variant="pill" width={96} height={38} />
          </div>
        </div>

        <div className="nx-set-tabs" style={{ width: 'fit-content' }}>
          <NxSkeleton variant="pill" width={92} height={34} strong />
          <NxSkeleton variant="pill" width={120} height={34} />
          <NxSkeleton variant="pill" width={96} height={34} />
          <NxSkeleton variant="pill" width={132} height={34} />
        </div>

        <section className="nx-set-card">
          <div className="nx-set-card-head">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <NxSkeleton width={164} height={16} strong />
              <NxSkeleton width={310} height={12} />
            </div>
            <NxSkeleton variant="pill" width={68} height={24} />
          </div>

          <div className="nx-set-card-body">
            <div className="nx-set-identity">
              <NxSkeleton width={64} height={64} style={{ borderRadius: 16 }} strong />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <NxSkeleton width={196} height={20} strong />
                <NxSkeleton width={236} height={13} />
              </div>
            </div>

            <div className="nx-set-form-grid">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <NxSkeleton width={102} height={13} />
                <NxSkeleton height={40} />
                <NxSkeleton width="78%" height={11} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <NxSkeleton width={108} height={13} />
                <NxSkeleton height={40} />
                <NxSkeleton width="82%" height={11} />
              </div>
            </div>
          </div>

          <div className="nx-set-card-footer">
            <NxSkeleton width={220} height={12} />
            <NxSkeleton variant="pill" width={124} height={38} strong />
          </div>
        </section>

        <section className="nx-set-card">
          <div className="nx-set-row">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
              <NxSkeleton width={152} height={14} strong />
              <NxSkeleton width={280} height={12} />
            </div>
            <NxSkeleton variant="pill" width={72} height={24} />
          </div>
        </section>
      </div>
    </div>
  );
}

export function NxProfileBadgeSkeleton({ sidebar = false }) {
  return (
    <span
      role="status"
      aria-label="Loading account"
      className={`nx-profile-skel${sidebar ? ' is-sidebar' : ''}`}
    >
      <NxSkeleton variant="circle" width={32} height={32} />
      {sidebar ? <NxSkeleton width={92} height={12} /> : <NxSkeleton width={14} height={10} />}
    </span>
  );
}

export function NxBrandSetupSkeleton() {
  return (
    <div className="nx-bs-skel" role="status" aria-live="polite" aria-label="Loading Brand Setup">
      <span className="sr-only">Loading Brand Setup…</span>
      <aside className="nx-bs-skel-tree" aria-hidden="true">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <NxSkeleton width={26} height={26} style={{ borderRadius: 8 }} />
          <NxSkeleton width={96} height={18} strong />
        </div>
        <NxSkeleton height={34} style={{ borderRadius: 10 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
          {Array.from({ length: 9 }).map((_, idx) => (
            <NxSkeleton key={idx} width={idx % 3 === 0 ? '86%' : '72%'} height={30} style={{ borderRadius: 8 }} strong={idx === 0} />
          ))}
        </div>
      </aside>

      <div className="nx-bs-skel-main" aria-hidden="true">
        <div className="nx-bs-skel-top">
          <NxSkeleton width={168} height={16} />
          <NxSkeleton variant="pill" width={88} height={32} strong />
        </div>
        <div className="nx-bs-skel-feed">
          <div className="nx-bs-skel-card">
            <NxSkeleton variant="media" height={112} style={{ borderRadius: '14px 14px 0 0' }} strong />
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <NxSkeleton width={128} height={22} strong />
                <NxSkeleton variant="pill" width={68} height={30} />
              </div>
              <NxSkeleton width="88%" height={14} />
              <NxSkeleton width="66%" height={14} />
              <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 14 }}>
                    <NxSkeleton width={82} height={13} />
                    <NxSkeleton width="76%" height={14} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="nx-bs-skel-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <NxSkeleton width={112} height={20} strong />
            <NxSkeleton width="62%" height={13} />
            {[0, 1, 2].map((row) => (
              <div key={row} style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 8 }}>
                <NxSkeleton width={48} height={48} style={{ borderRadius: 12 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <NxSkeleton width={116} height={14} strong />
                  <NxSkeleton width="74%" height={12} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function NxIntegrationsSkeleton() {
  return (
    <main className="nx-content-page nx-integrations-page" role="status" aria-live="polite" aria-label="Loading integrations">
      <span className="sr-only">Loading integrations…</span>
      <div className="nx-int-container" aria-hidden="true">
        <div className="nx-int-header">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <NxSkeleton width={164} height={28} strong />
            <NxSkeleton width={380} height={14} style={{ maxWidth: '86vw' }} />
          </div>
          <NxSkeleton width={148} height={40} style={{ borderRadius: 10 }} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 14, marginTop: 26 }}>
          <div style={{ display: 'flex', gap: 18 }}>
            <NxSkeleton width={110} height={28} strong />
            <NxSkeleton width={118} height={28} />
            <NxSkeleton width={96} height={28} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <NxSkeleton width={220} height={40} style={{ borderRadius: 10 }} />
            <NxSkeleton width={88} height={40} style={{ borderRadius: 10 }} />
          </div>
        </div>
        <div style={{ marginTop: 28 }}>
          <NxSkeleton width={130} height={18} strong style={{ marginBottom: 16 }} />
          <div className="nx-int-grid">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="nx-skel-card" style={{ padding: 20, gap: 14 }}>
                <NxSkeleton width={44} height={44} style={{ borderRadius: 12 }} strong />
                <NxSkeleton width={124} height={16} strong />
                <NxSkeleton width="92%" height={12} />
                <NxSkeleton width="72%" height={12} />
                <NxSkeleton variant="pill" width={96} height={36} style={{ marginTop: 6 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

export function NxOnboardingSkeleton() {
  return (
    <div className="nx-onb-skel" role="status" aria-live="polite" aria-label="Loading onboarding">
      <span className="sr-only">Loading onboarding…</span>
      <div className="nx-onb-skel-card" aria-hidden="true">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <NxSkeleton width={96} height={22} strong />
          <NxSkeleton variant="pill" width={88} height={24} />
        </div>
        <NxSkeleton height={6} variant="pill" style={{ marginTop: 18 }} />
        <NxSkeleton width="64%" height={30} strong style={{ marginTop: 28 }} />
        <NxSkeleton width="82%" height={14} style={{ marginTop: 10 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 26 }}>
          {Array.from({ length: 6 }).map((_, idx) => (
            <NxSkeleton key={idx} height={68} style={{ borderRadius: 14 }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
          <NxSkeleton variant="pill" width={88} height={40} />
          <NxSkeleton variant="pill" width={128} height={40} strong />
        </div>
      </div>
    </div>
  );
}

export function NxAdminSkeleton({ label = 'Loading admin console' }) {
  return (
    <div className="nx-admin-skel" role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}…</span>
      <aside className="nx-admin-skel-side" aria-hidden="true">
        <NxSkeleton width={128} height={22} strong />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
          {Array.from({ length: 8 }).map((_, idx) => (
            <NxSkeleton key={idx} height={34} style={{ borderRadius: 10 }} strong={idx === 0} />
          ))}
        </div>
      </aside>
      <div className="nx-admin-skel-main" aria-hidden="true">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <NxSkeleton width={210} height={26} strong />
            <NxSkeleton width={310} height={13} />
          </div>
          <NxSkeleton variant="pill" width={170} height={36} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className="nx-skel-card">
              <NxSkeleton width={88} height={12} />
              <NxSkeleton width={116} height={26} strong />
              <NxSkeleton width={74} height={11} />
            </div>
          ))}
        </div>
        <div className="nx-skel-table">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="nx-skel-table-row">
              <NxSkeleton width="78%" height={13} strong={idx === 0} />
              <NxSkeleton width="64%" height={13} />
              <NxSkeleton width="72%" height={13} />
              <NxSkeleton width="52%" height={13} />
              <NxSkeleton variant="pill" width={68} height={20} />
              <NxSkeleton width={48} height={13} style={{ marginLeft: 'auto' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
