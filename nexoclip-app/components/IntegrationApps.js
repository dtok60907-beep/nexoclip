'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { NxInlineSpinner, NxIntegrationsSkeleton, NxSkeleton } from './ui/nx-loading';

const INITIAL_INTEGRATIONS = [
  // Ads accounts: Meta Ads
  {
    id: 'meta-ads',
    tab: 'ads',
    title: 'Meta Ads',
    connected: false,
    icon: 'meta',
    provider: 'meta',
    description:
      'Integrate NexoClip with Meta Ads to synchronize your ad campaigns, ROAS performance, and creative workflows.',
  },

  // Social account: YouTube, Instagram, TikTok
  {
    id: 'youtube-social',
    tab: 'social',
    title: 'YouTube',
    connected: false,
    icon: 'youtube',
    provider: 'youtube',
    description:
      'Integrate NexoClip with YouTube to publish Shorts, widescreen videos, and custom AI thumbnails directly.',
  },
  {
    id: 'instagram-social',
    tab: 'social',
    title: 'Instagram',
    connected: true,
    icon: 'instagram',
    provider: 'meta',
    description:
      'Integrate NexoClip with Instagram to auto-publish 9:16 Reels, schedule posts, and sync engagement insights.',
  },
  {
    id: 'tiktok-social',
    tab: 'social',
    title: 'TikTok',
    connected: false,
    icon: 'tiktok',
    provider: 'tiktok',
    description:
      'Integrate NexoClip with TikTok to export 9:16 UGC videos and push rendered drafts to your creator inbox.',
  },

  // Additional: Google Sheets, Google Drive, Dropbox
  {
    id: 'google-sheets',
    tab: 'additional',
    title: 'Google Sheets',
    connected: true,
    icon: 'sheets',
    provider: 'google-sheets',
    description:
      'Integrate NexoClip with Google Sheets to import bulk content briefs and sync campaign performance rows.',
  },
  {
    id: 'google-drive',
    tab: 'additional',
    title: 'Google Drive',
    connected: true,
    icon: 'drive',
    provider: 'google-drive',
    description:
      'Integrate NexoClip with Google Drive to import raw footage and automatically back up rendered videos.',
  },
  {
    id: 'dropbox',
    tab: 'additional',
    title: 'Dropbox',
    connected: false,
    icon: 'dropbox',
    provider: 'dropbox',
    description:
      'Integrate NexoClip with Dropbox to synchronize media folders and export high-bitrate final video cuts.',
  },
];

function BrandLogo({ kind }) {
  switch (kind) {
    case 'meta':
      return (
        <div className="nx-int-brand-logo" aria-hidden="true">
          <svg viewBox="0 0 36 36" className="nx-int-logo-svg" fill="none">
            <path
              d="M6.2 22.8c0-4.9 3.1-9.8 6.8-9.8 2.4 0 4.1 1.7 6.2 4.9l1.9 3c1.3 1.9 2.4 2.9 3.6 2.9 2 0 3.6-2.4 3.6-5.5 0-3.1-1.7-5.2-3.8-5.2-1.6 0-3 1.1-4.4 3.3l-1.1 1.7"
              stroke="#0081FB"
              strokeWidth="3.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M17.6 18.7l-1.3 2c-1.9 2.9-3.6 4.6-6.1 4.6-2.5 0-4-1.9-4-2.5"
              stroke="#0064E0"
              strokeWidth="3.1"
              strokeLinecap="round"
            />
          </svg>
        </div>
      );
    case 'youtube':
      return (
        <div className="nx-int-brand-logo" aria-hidden="true">
          <svg viewBox="0 0 36 36" className="nx-int-logo-svg" fill="none">
            <rect x="3" y="7.5" width="30" height="21" rx="6" fill="#FF0000" />
            <path d="M15 13.2L23.2 18L15 22.8V13.2Z" fill="#FFFFFF" />
          </svg>
        </div>
      );
    case 'instagram':
      return (
        <div className="nx-int-brand-logo" aria-hidden="true">
          <svg viewBox="0 0 36 36" className="nx-int-logo-svg" fill="none">
            <defs>
              <linearGradient id="nx-ig-grad" x1="4" y1="32" x2="32" y2="4" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#F58529" />
                <stop offset="45%" stopColor="#DD2A7B" />
                <stop offset="100%" stopColor="#515BD4" />
              </linearGradient>
            </defs>
            <rect x="4.5" y="4.5" width="27" height="27" rx="7.5" stroke="url(#nx-ig-grad)" strokeWidth="2.8" />
            <circle cx="18" cy="18" r="6" stroke="url(#nx-ig-grad)" strokeWidth="2.8" />
            <circle cx="25.6" cy="10.4" r="1.7" fill="#DD2A7B" />
          </svg>
        </div>
      );
    case 'tiktok':
      return (
        <div className="nx-int-brand-logo" aria-hidden="true">
          <svg viewBox="0 0 36 36" className="nx-int-logo-svg" fill="none">
            <path
              d="M21.8 6.8v14.2a5.5 5.5 0 1 1-4.3-5.3"
              stroke="#111827"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M21.8 6.8c1 3.3 3.4 5.4 6.6 5.7"
              stroke="#EE1D52"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M17.5 15.7a5.5 5.5 0 0 0-4.2 5.3"
              stroke="#25F4EE"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </svg>
        </div>
      );
    case 'sheets':
      return (
        <div className="nx-int-brand-logo" aria-hidden="true">
          <svg viewBox="0 0 36 36" className="nx-int-logo-svg" fill="none">
            <path
              d="M9 4.5h12l7.5 7.5v18A2.5 2.5 0 0 1 26 32.5H9A2.5 2.5 0 0 1 6.5 30V7A2.5 2.5 0 0 1 9 4.5Z"
              fill="#0F9D58"
            />
            <path d="M21 4.5V12h7.5L21 4.5Z" fill="#87CEAC" />
            <rect x="11" y="15.5" width="13" height="11" rx="1" stroke="#FFFFFF" strokeWidth="1.8" />
            <line x1="11" y1="21" x2="24" y2="21" stroke="#FFFFFF" strokeWidth="1.8" />
            <line x1="17.5" y1="15.5" x2="17.5" y2="26.5" stroke="#FFFFFF" strokeWidth="1.8" />
          </svg>
        </div>
      );
    case 'drive':
      return (
        <div className="nx-int-brand-logo" aria-hidden="true">
          <svg viewBox="0 0 36 36" className="nx-int-logo-svg" fill="none">
            <path d="M13.6 6.5h8.8l9.6 16.5-4.4 7.5H9.2L4 23l9.6-16.5Z" fill="#F8FAFC" />
            <path d="M13.6 6.5L4 23l4.4 7.5 9.6-16.5-4.4-7.5Z" fill="#0F9D58" />
            <path d="M13.6 6.5h8.8L32 23h-8.8L13.6 6.5Z" fill="#F4B400" />
            <path d="M12.8 23H32l-4.4 7.5H8.4L12.8 23Z" fill="#4285F4" />
          </svg>
        </div>
      );
    case 'dropbox':
      return (
        <div className="nx-int-brand-logo" aria-hidden="true">
          <svg viewBox="0 0 36 36" className="nx-int-logo-svg" fill="none">
            <path d="M11.5 6.5L4 11.4l6.5 4.9 7.5-4.9-6.5-4.9Z" fill="#0061FF" />
            <path d="M24.5 6.5L18 11.4l7.5 4.9 6.5-4.9-7.5-4.9Z" fill="#0061FF" />
            <path d="M4 21.2l7.5 4.9 6.5-4.9-7.5-4.9-6.5 4.9Z" fill="#0061FF" />
            <path d="M25.5 16.3L18 21.2l6.5 4.9 7.5-4.9-6.5-4.9Z" fill="#0061FF" />
            <path d="M18 22.8l-6.5 4.9-2.8-1.8v2.2L18 33.8l9.3-5.7v-2.2l-2.8 1.8-6.5-4.9Z" fill="#0061FF" />
          </svg>
        </div>
      );
    default:
      return null;
  }
}

export default function IntegrationApps({ authStatus }) {
  const [activeTab, setActiveTab] = useState('ads');
  const [items, setItems] = useState(INITIAL_INTEGRATIONS);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [statusBanner, setStatusBanner] = useState('');
  const [busyId, setBusyId] = useState('');
  const [syncing, setSyncing] = useState(false);

  const headers = useCallback(() => ({
    'x-workspace-id': typeof window !== 'undefined' ? window.sessionStorage.getItem('nexoclip_workspace_id') || '' : '',
  }), []);

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      setSyncing(false);
      return undefined;
    }
    let active = true;
    setSyncing(true);
    const metaReq = fetch('/api/meta/accounts', { headers: headers(), credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d && ((d.accounts && d.accounts.length > 0) || (d.adAccounts && d.adAccounts.length > 0))) {
          setItems((prev) =>
            prev.map((item) => (item.provider === 'meta' ? { ...item, connected: true } : item))
          );
        }
      })
      .catch(() => {});

    const tiktokReq = fetch('/api/tiktok/accounts', { headers: headers(), credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d?.accounts?.length > 0) {
          setItems((prev) =>
            prev.map((item) => (item.provider === 'tiktok' ? { ...item, connected: true } : item))
          );
        }
      })
      .catch(() => {});

    Promise.allSettled([metaReq, tiktokReq]).finally(() => {
      if (active) setSyncing(false);
    });
    return () => { active = false; };
  }, [authStatus, headers]);

  const handleCardAction = async (item) => {
    if (item.connected) {
      setItems((prev) =>
        prev.map((entry) => (entry.id === item.id ? { ...entry, connected: false } : entry))
      );
      setStatusBanner(`${item.title} integration disabled.`);
      return;
    }

    if (item.provider === 'tiktok' && authStatus === 'authenticated') {
      const ws = typeof window !== 'undefined' ? window.sessionStorage.getItem('nexoclip_workspace_id') || '' : '';
      window.location.href = `/api/tiktok/oauth/start?workspace_id=${encodeURIComponent(ws)}`;
      return;
    }

    if (item.provider === 'meta' && authStatus === 'authenticated') {
      setBusyId(item.id);
      setStatusBanner('');
      try {
        const r = await fetch('/api/meta/oauth/start', {
          method: 'POST',
          headers: headers(),
          credentials: 'include',
        });
        const d = await r.json();
        if (r.ok && d?.url) {
          window.location.assign(d.url);
          return;
        }
      } catch {
        // Fallback to local enable
      } finally {
        setBusyId('');
      }
    }

    setItems((prev) =>
      prev.map((entry) => (entry.id === item.id ? { ...entry, connected: true } : entry))
    );
    setStatusBanner(`${item.title} connected and enabled for NexoClip.`);
  };

  const filterItem = useCallback(
    (item) => {
      if (statusFilter === 'active' && !item.connected) return false;
      if (statusFilter === 'inactive' && item.connected) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q))
      );
    },
    [query, statusFilter]
  );

  const primaryItems = useMemo(
    () => items.filter((item) => item.tab === activeTab && filterItem(item)),
    [items, activeTab, filterItem]
  );

  const additionalItems = useMemo(
    () => items.filter((item) => item.tab === 'additional' && filterItem(item)),
    [items, filterItem]
  );

  const counts = useMemo(
    () => ({
      ads: items.filter((i) => i.tab === 'ads').length,
      social: items.filter((i) => i.tab === 'social').length,
      additional: items.filter((i) => i.tab === 'additional').length,
    }),
    [items]
  );

  const renderCard = (item) => {
    const isBusy = busyId === item.id;
    const isSyncingCard = syncing && (item.provider === 'meta' || item.provider === 'tiktok');
    return (
      <article key={item.id} className="nx-int-card">
        <BrandLogo kind={item.icon} />
        <h3 className="nx-int-card-title">{item.title}</h3>
        <p className="nx-int-card-desc">{item.description}</p>
        <div className="nx-int-card-footer">
          {isSyncingCard ? (
            <NxSkeleton variant="pill" width={94} height={38} />
          ) : (
            <button
              type="button"
              className={`nx-int-pill-btn ${item.connected ? 'is-enabled' : 'is-connect'}`}
              disabled={isBusy}
              onClick={() => handleCardAction(item)}
            >
              {isBusy ? 'Connecting...' : item.connected ? 'Enabled' : 'Connect'}
            </button>
          )}
        </div>
      </article>
    );
  };

  const primarySectionTitle =
    activeTab === 'ads'
      ? 'Ads accounts'
      : activeTab === 'social'
      ? 'Social account'
      : 'Additional';

  if (authStatus === 'loading') {
    return <NxIntegrationsSkeleton />;
  }

  return (
    <main
      className="nx-content-page nx-integrations-page"
      onClick={() => {
        if (filterOpen) setFilterOpen(false);
      }}
    >
      <div className="nx-int-container">
        {/* Top Header */}
        <header data-tour="integrations-header" className="nx-int-header">
          <div className="nx-int-header-copy">
            <h1 className="nx-int-title">Integrations</h1>
            <p className="nx-int-subtitle">
              Connect your ad accounts, social channels, and cloud workspace tools with NexoClip.
            </p>
          </div>
          <button
            type="button"
            className="nx-int-new-btn"
            onClick={() => setModalOpen(true)}
          >
            <svg viewBox="0 0 20 20" className="od-icon" style={{ '--od-icon-size': '16px' }} fill="none">
              <path d="M10 4.5v11M4.5 10h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>New integration</span>
          </button>
        </header>

        {statusBanner ? (
          <div className="nx-int-banner" role="status">
            <span>{statusBanner}</span>
            <button type="button" onClick={() => setStatusBanner('')} aria-label="Dismiss notification">
              ×
            </button>
          </div>
        ) : null}

        {/* Tabs + Search & Filter Toolbar */}
        <div data-tour="integrations-toolbar" className="nx-int-toolbar">
          <div className="nx-int-tabs" role="tablist" aria-label="Integration categories">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'ads'}
              className={`nx-int-tab ${activeTab === 'ads' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('ads')}
            >
              <span>Ads accounts</span>
              <span className="nx-int-tab-count">{counts.ads}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'social'}
              className={`nx-int-tab ${activeTab === 'social' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('social')}
            >
              <span>Social account</span>
              <span className="nx-int-tab-count">{counts.social}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'additional'}
              className={`nx-int-tab ${activeTab === 'additional' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('additional')}
            >
              <span>Additional</span>
              <span className="nx-int-tab-count">{counts.additional}</span>
            </button>
          </div>

          <div className="nx-int-controls">
            {syncing && (
              <span className="nx-sync-pill" role="status" aria-live="polite">
                <NxInlineSpinner size={13} />
                <span>Syncing accounts</span>
              </span>
            )}
            <label className="nx-int-search">
              <svg viewBox="0 0 20 20" className="od-icon nx-int-search-icon" style={{ '--od-icon-size': '16px' }} fill="none">
                <circle cx="9" cy="9" r="5.8" stroke="currentColor" strokeWidth="1.7" />
                <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                aria-label="Search integrations"
              />
            </label>

            <div className="nx-int-filter-wrap" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className={`nx-int-filter-btn ${statusFilter !== 'all' ? 'is-filtered' : ''}`}
                onClick={() => setFilterOpen((v) => !v)}
                aria-expanded={filterOpen}
              >
                <svg viewBox="0 0 20 20" className="od-icon" style={{ '--od-icon-size': '16px' }} fill="none">
                  <path d="M3.5 5.5h13M6 10h8M8.5 14.5h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
                <span>{statusFilter === 'all' ? 'Filter' : statusFilter === 'active' ? 'Enabled' : 'Not connected'}</span>
              </button>
              {filterOpen ? (
                <div className="nx-int-filter-menu" role="menu">
                  <button
                    type="button"
                    className={statusFilter === 'all' ? 'is-selected' : ''}
                    onClick={() => {
                      setStatusFilter('all');
                      setFilterOpen(false);
                    }}
                  >
                    View all
                  </button>
                  <button
                    type="button"
                    className={statusFilter === 'active' ? 'is-selected' : ''}
                    onClick={() => {
                      setStatusFilter('active');
                      setFilterOpen(false);
                    }}
                  >
                    Enabled only
                  </button>
                  <button
                    type="button"
                    className={statusFilter === 'inactive' ? 'is-selected' : ''}
                    onClick={() => {
                      setStatusFilter('inactive');
                      setFilterOpen(false);
                    }}
                  >
                    Not connected
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Primary Tab Section */}
        <section data-tour="integrations-grid" className="nx-int-section" aria-label={primarySectionTitle}>
          <h2 className="nx-int-section-heading">{primarySectionTitle}</h2>
          {primaryItems.length > 0 ? (
            <div className="nx-int-grid">{primaryItems.map(renderCard)}</div>
          ) : (
            <div className="nx-int-empty">
              <h3>No integrations match your filter</h3>
              <p>Try clearing the search query or switching the status filter.</p>
              <button
                type="button"
                className="nx-int-reset-btn"
                onClick={() => {
                  setQuery('');
                  setStatusFilter('all');
                }}
              >
                Reset filters
              </button>
            </div>
          )}
        </section>

        {/* Additional Section (Google Sheets, Google Drive, Dropbox) shown below Ads/Social tabs */}
        {activeTab !== 'additional' && additionalItems.length > 0 ? (
          <section className="nx-int-section" aria-label="Additional integrations">
            <h2 className="nx-int-section-heading">Additional</h2>
            <div className="nx-int-grid">{additionalItems.map(renderCard)}</div>
          </section>
        ) : null}
      </div>

      {/* Quick Connect Modal */}
      {modalOpen ? (
        <div className="nx-int-modal-backdrop" onClick={() => setModalOpen(false)}>
          <div
            className="nx-int-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nx-int-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="nx-int-modal-head">
              <div>
                <h2 id="nx-int-modal-title">Connect an integration</h2>
                <p>Select a platform below to synchronize with your NexoClip workspace.</p>
              </div>
              <button
                type="button"
                className="nx-int-modal-close"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            <div className="nx-int-oauth-quick">
              {items.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="nx-int-oauth-btn"
                  onClick={() => {
                    setModalOpen(false);
                    if (!entry.connected) {
                      handleCardAction(entry);
                    }
                  }}
                >
                  <BrandLogo kind={entry.icon} />
                  <div className="nx-int-oauth-copy">
                    <strong>{entry.title}</strong>
                    <span>{entry.connected ? 'Currently enabled' : 'Click to connect'}</span>
                  </div>
                  <span
                    className={`nx-int-pill-btn nx-int-pill-btn--sm ${
                      entry.connected ? 'is-enabled' : 'is-connect'
                    }`}
                  >
                    {entry.connected ? 'Enabled' : 'Connect'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
