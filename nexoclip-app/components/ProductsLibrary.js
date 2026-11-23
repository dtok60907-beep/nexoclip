'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckSquare,
  Package,
  Pencil,
  Play,
  Plus,
  Search,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { ELEVENLABS_VOICES } from '../src/services/elevenlabsAudio';

const AVATAR_PRESETS = [
  { id: 'rina-studio', name: 'Rina — UGC Host Studio' },
  { id: 'dimas-kitchen', name: 'Dimas — Lifestyle Presenter' },
  { id: 'sara-minimal', name: 'Sara — Beauty & Skincare' },
  { id: 'bima-outdoor', name: 'Bima — Tech & Product Reviewer' },
];

const ASPECT_OPTIONS = ['9:16', '16:9', '1:1', '4:5'];
const DURATION_OPTIONS = ['15s', '30s', '45s', '60s'];
const LANGUAGE_OPTIONS = ['Indonesian', 'English'];

const fieldClass =
  'h-[38px] rounded-[10px] border border-[#e5e5ee] bg-white px-3 text-[13px] text-[#14141f] outline-none transition focus:border-[#14141f]';

const formatDate = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
};

function emptyDraft() {
  return {
    id: null,
    name: '',
    advantages: '',
    highlights: [],
    audiences: [],
    media: [], // { id, url, name, kind: 'image'|'video', selected: true, status: 'Analysis Completed' }
    avatarId: AVATAR_PRESETS[0].id,
    voiceId: ELEVENLABS_VOICES[0]?.id || '',
    aspectRatio: '9:16',
    duration: '15s',
    language: 'Indonesian',
    updatedAt: null,
  };
}

export default function ProductsLibrary({ authStatus, onSignIn, onNavigate }) {
  const [products, setProducts] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState('list'); // 'list' | 'editor'
  const [draft, setDraft] = useState(() => emptyDraft());
  const [search, setSearch] = useState('');
  const [aspectFilter, setAspectFilter] = useState('');
  const [order, setOrder] = useState('newest');
  const [highlightInput, setHighlightInput] = useState('');
  const [audienceInput, setAudienceInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    const workspace = window.sessionStorage.getItem('nexoclip_workspace_id');
    if (!workspace) return;
    let active = true;
    fetch('/api/products', {
      credentials: 'include',
      headers: { 'x-workspace-id': workspace },
      cache: 'no-store',
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Failed to load products.');
        return body;
      })
      .then((body) => {
        if (active) setProducts(Array.isArray(body.products) ? body.products : []);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, [authStatus]);

  const productRequest = useCallback(async (url, method, data) => {
    const workspace = window.sessionStorage.getItem('nexoclip_workspace_id');
    const response = await fetch(url, {
      method,
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'x-workspace-id': workspace || '',
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Failed to save product.');
    return body;
  }, []);

  const openCreate = () => {
    setDraft(emptyDraft());
    setHighlightInput('');
    setAudienceInput('');
    setError('');
    setView('editor');
  };

  const openEdit = (product) => {
    setDraft({
      ...emptyDraft(),
      ...product,
      highlights: Array.isArray(product.highlights) ? product.highlights : [],
      audiences: Array.isArray(product.audiences) ? product.audiences : [],
      media: Array.isArray(product.media) ? product.media : [],
    });
    setHighlightInput('');
    setAudienceInput('');
    setError('');
    setView('editor');
  };

  const deleteProduct = async (id) => {
    try {
      await productRequest(`/api/products/${encodeURIComponent(id)}`, 'DELETE');
      setProducts((items) => items.filter((p) => p.id !== id));
    } catch (e) {
      setError(e.message);
    }
  };

  const addHighlight = () => {
    const val = highlightInput.trim();
    if (!val) return;
    if (!draft.highlights.includes(val)) {
      setDraft((d) => ({ ...d, highlights: [...d.highlights, val] }));
    }
    setHighlightInput('');
  };

  const addAudience = () => {
    const val = audienceInput.trim();
    if (!val) return;
    if (!draft.audiences.includes(val)) {
      setDraft((d) => ({ ...d, audiences: [...d.audiences, val] }));
    }
    setAudienceInput('');
  };

  const handleUploadFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => /^(image|video)\//.test(f.type));
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      const workspaceId = window.sessionStorage.getItem('nexoclip_workspace_id') || '';
      const uploadedItems = await Promise.all(
        files.slice(0, 8).map(async (file) => {
          const kind = file.type.startsWith('video/') ? 'video' : 'image';
          let url = '';
          if (authStatus === 'authenticated' && workspaceId) {
            try {
              const form = new FormData();
              form.append('file', file);
              const res = await fetch('/api/uploads', {
                method: 'POST',
                body: form,
                credentials: 'include',
                headers: { 'x-workspace-id': workspaceId },
              });
              const data = await res.json().catch(() => ({}));
              if (res.ok && data.url) url = data.url;
            } catch {
              // fallback below
            }
          }
          if (!url) {
            url = await new Promise((resolve) => {
              if (kind === 'image' && file.size < 1.5 * 1024 * 1024) {
                const reader = new FileReader();
                reader.onload = () =>
                  resolve(typeof reader.result === 'string' ? reader.result : URL.createObjectURL(file));
                reader.onerror = () => resolve(URL.createObjectURL(file));
                reader.readAsDataURL(file);
              } else {
                resolve(URL.createObjectURL(file));
              }
            });
          }
          return {
            id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            url,
            name: file.name,
            kind,
            selected: true,
            status: 'Ready',
          };
        }),
      );
      setDraft((d) => ({ ...d, media: [...d.media, ...uploadedItems] }));
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const allSelected = draft.media.length > 0 && draft.media.every((m) => m.selected);

  const toggleAllMedia = () => {
    const nextVal = !allSelected;
    setDraft((d) => ({
      ...d,
      media: d.media.map((m) => ({ ...m, selected: nextVal })),
    }));
  };

  const saveDraft = async () => {
    const name = draft.name.trim();
    if (!name) {
      setError('Product Name is required.');
      return null;
    }
    setSaving(true);
    const saved = {
      ...draft,
      id: draft.id,
      name,
      advantages: draft.advantages.trim(),
      updatedAt: new Date().toISOString(),
    };
    try {
      const result = await productRequest(
        saved.id ? `/api/products/${encodeURIComponent(saved.id)}` : '/api/products',
        saved.id ? 'PUT' : 'POST',
        saved,
      );
      const persisted = result.product;
      setProducts((items) => [persisted, ...items.filter((p) => p.id !== persisted.id)]);
      setDraft(persisted);
      setError('');
      return persisted;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOnly = async () => {
    const saved = await saveDraft();
    if (saved) setView('list');
  };

  const buildBrief = (product) => {
    const avatarName = AVATAR_PRESETS.find((a) => a.id === product.avatarId)?.name || 'UGC Creator';
    const voiceObj = ELEVENLABS_VOICES.find((v) => v.id === product.voiceId);
    const parts = [
      `Create a ${product.duration} product ad video (${product.aspectRatio}, ${product.language}) for "${product.name}".`,
      product.advantages ? `Key advantages: ${product.advantages}` : '',
      product.highlights?.length ? `Highlights: ${product.highlights.join(', ')}.` : '',
      product.audiences?.length ? `Target audience: ${product.audiences.join(', ')}.` : '',
      `Presenter/Avatar: ${avatarName}${voiceObj ? ` · Voice: ${voiceObj.name}` : ''}.`,
    ].filter(Boolean);
    return parts.join('\n');
  };

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = products.filter((p) => {
      if (aspectFilter && p.aspectRatio !== aspectFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.advantages || '').toLowerCase().includes(q) ||
        (p.highlights || []).some((h) => h.toLowerCase().includes(q))
      );
    });
    return [...list].sort((a, b) => {
      if (order === 'name') return (a.name || '').localeCompare(b.name || '');
      const ta = new Date(a.updatedAt || a.updated_at || a.createdAt || 0).getTime();
      const tb = new Date(b.updatedAt || b.updated_at || b.createdAt || 0).getTime();
      return order === 'oldest' ? ta - tb : tb - ta;
    });
  }, [products, search, aspectFilter, order]);

  if (authStatus === 'guest') {
    return (
      <main className="nx-library nx-content-page !bg-white">
        <h1>Products</h1>
        <p>Sign in to save your products and generate product videos.</p>
        <button
          type="button"
          onClick={onSignIn}
          className="mt-2 inline-flex h-[36px] items-center rounded-full border border-[#dfe0ea] bg-[#f4f4f7] px-4 text-[13px] font-semibold text-[#14141f] transition hover:border-[#cfd0de] hover:bg-[#e9e9f0]"
        >
          Sign in to view products
        </button>
      </main>
    );
  }

  /* ── ADD / EDIT PRODUCT EDITOR ── */
  if (view === 'editor') {
    return (
      <main className="h-full w-full overflow-y-auto bg-[#fafafc] text-[#14141f]">
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#ececf3] bg-white/95 px-5 py-3.5 backdrop-blur-md md:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setView('list')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e5e5ee] bg-white text-[#5c5d70] transition hover:border-[#cfd0de] hover:bg-[#f6f6fa] hover:text-[#14141f]"
              aria-label="Back to Products"
            >
              <ArrowLeft size={15} />
            </button>
            <h1 className="text-[15.5px] font-semibold tracking-[-0.015em] text-[#14141f]">
              {draft.id ? 'Edit Product' : 'Add Product'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveOnly}
              className="inline-flex h-9 items-center rounded-full border border-[#dfe0ea] bg-[#f4f4f7] px-4 text-[13px] font-semibold text-[#14141f] transition hover:border-[#cfd0de] hover:bg-[#e9e9f0] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Product'}
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-[780px] px-5 py-8 md:px-6 pb-16">
          <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-[#14141f]">Product Details</h2>
          <p className="mt-1 text-[13px] text-[#6d6e80]">
            Add clear product selling points and visual assets so AI Director builds accurate ads.
          </p>

          {error && (
            <p
              className="mt-4 rounded-xl border border-[#fecdd3] bg-[#fff1f2] px-4 py-2.5 text-[13px] text-[#be123c]"
              role="alert"
            >
              {error}
            </p>
          )}

          {/* Product Details Card */}
          <section className="mt-5 rounded-2xl border border-[#e7e7f0] bg-white p-5 space-y-4">
            <div>
              <label htmlFor="nx-prod-name" className="block text-[12px] font-medium text-[#6d6e80] mb-1.5">
                Product Name
              </label>
              <input
                id="nx-prod-name"
                type="text"
                value={draft.name}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, name: e.target.value }));
                  if (error) setError('');
                }}
                placeholder="e.g. GlowDrop Vitamin C Serum"
                className="h-10 w-full rounded-[10px] border border-[#e5e5ee] bg-[#fafafc] px-3.5 text-[13.5px] text-[#14141f] placeholder:text-[#9899ab] outline-none transition focus:border-[#14141f] focus:bg-white"
              />
            </div>

            <div>
              <label htmlFor="nx-prod-adv" className="block text-[12px] font-medium text-[#6d6e80] mb-1.5">
                Product Advantages
              </label>
              <textarea
                id="nx-prod-adv"
                rows={3}
                value={draft.advantages}
                onChange={(e) => setDraft((d) => ({ ...d, advantages: e.target.value }))}
                placeholder="Describe key benefits, unique formula, pricing edge, or why customers love this product..."
                className="w-full resize-y rounded-[10px] border border-[#e5e5ee] bg-[#fafafc] px-3.5 py-2.5 text-[13.5px] leading-relaxed text-[#14141f] placeholder:text-[#9899ab] outline-none transition focus:border-[#14141f] focus:bg-white"
              />
            </div>

            {/* Highlights tag row */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="w-28 text-[12.5px] font-medium text-[#5c5d70]">Highlights</span>
              <button
                type="button"
                onClick={addHighlight}
                aria-label="Add highlight"
                className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg border border-[#e5e5ee] bg-white text-[#2d2e3f] transition hover:border-[#cfd0de] hover:bg-[#f5f5f9] hover:text-[#14141f]"
              >
                <Plus size={14} strokeWidth={2.2} />
              </button>
              <input
                type="text"
                value={highlightInput}
                onChange={(e) => setHighlightInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addHighlight();
                  }
                }}
                placeholder="Enter highlight & press Enter"
                className="h-[30px] min-w-[180px] rounded-lg border border-[#e5e5ee] bg-[#fafafc] px-2.5 text-[12px] text-[#14141f] placeholder:text-[#8e8fa2] outline-none focus:border-[#14141f] focus:bg-white"
              />
              {draft.highlights.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#e5e5ee] bg-[#f5f5f8] px-2.5 py-1 text-[12px] font-medium text-[#2b2c3a]"
                >
                  {item}
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, highlights: d.highlights.filter((x) => x !== item) }))}
                    className="text-[#7c7d90] hover:text-[#14141f]"
                    aria-label={`Remove ${item}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>

            {/* Target Audience tag row */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-28 text-[12.5px] font-medium text-[#5c5d70]">Target Audience</span>
              <button
                type="button"
                onClick={addAudience}
                aria-label="Add target audience"
                className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg border border-[#e5e5ee] bg-white text-[#2d2e3f] transition hover:border-[#cfd0de] hover:bg-[#f5f5f9] hover:text-[#14141f]"
              >
                <Plus size={14} strokeWidth={2.2} />
              </button>
              <input
                type="text"
                value={audienceInput}
                onChange={(e) => setAudienceInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addAudience();
                  }
                }}
                placeholder="Enter target audience & press Enter"
                className="h-[30px] min-w-[180px] rounded-lg border border-[#e5e5ee] bg-[#fafafc] px-2.5 text-[12px] text-[#14141f] placeholder:text-[#8e8fa2] outline-none focus:border-[#14141f] focus:bg-white"
              />
              {draft.audiences.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#e5e5ee] bg-[#f5f5f8] px-2.5 py-1 text-[12px] font-medium text-[#2b2c3a]"
                >
                  {item}
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, audiences: d.audiences.filter((x) => x !== item) }))}
                    className="text-[#7c7d90] hover:text-[#14141f]"
                    aria-label={`Remove ${item}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          </section>

          {/* Media Assets section */}
          <section className="mt-7">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[15.5px] font-semibold text-[#14141f]">Product Media</h3>
              {draft.media.length > 0 && (
                <button
                  type="button"
                  onClick={toggleAllMedia}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e5ee] bg-white px-3 py-1.5 text-[12px] font-medium text-[#3d3e52] transition hover:border-[#cfd0de] hover:text-[#14141f]"
                >
                  {allSelected ? <CheckSquare size={14} className="text-[#14141f]" /> : <Square size={14} />}
                  <span>{allSelected ? 'Unselect All' : 'Select All'}</span>
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              hidden
              onChange={(e) => {
                handleUploadFiles(e.target.files);
                e.target.value = '';
              }}
            />

            <div className="mt-3.5 grid grid-cols-2 gap-3.5 sm:grid-cols-4 md:grid-cols-5">
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center aspect-square rounded-2xl border border-dashed border-[#d4d5e2] bg-white text-[#2d2e3f] transition hover:border-[#14141f] hover:bg-[#f6f6fa] disabled:opacity-50"
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg border border-[#dfe0ea] bg-[#f4f4f7] text-[#14141f]">
                  {uploading ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#14141f]/25 border-t-[#14141f]" />
                  ) : (
                    <Plus size={16} strokeWidth={2.3} />
                  )}
                </span>
                <span className="mt-2.5 text-[12.5px] font-medium text-[#14141f]">
                  {uploading ? 'Uploading…' : 'Upload'}
                </span>
              </button>

              {draft.media.map((item) => (
                <div key={item.id} className="flex flex-col items-center">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        media: d.media.map((m) => (m.id === item.id ? { ...m, selected: !m.selected } : m)),
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDraft((d) => ({
                          ...d,
                          media: d.media.map((m) => (m.id === item.id ? { ...m, selected: !m.selected } : m)),
                        }));
                      }
                    }}
                    className={`group relative w-full aspect-square overflow-hidden rounded-2xl border-2 transition cursor-pointer bg-[#14141f] ${
                      item.selected ? 'border-[#14141f]' : 'border-[#e5e5ee] opacity-65'
                    }`}
                  >
                    {item.kind === 'video' ? (
                      <video src={item.url} muted playsInline className="h-full w-full object-cover" />
                    ) : (
                      <img src={item.url} alt={item.name} className="h-full w-full object-cover" />
                    )}
                    <span
                      className={`absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full border transition ${
                        item.selected ? 'border-[#14141f] bg-white text-[#14141f] shadow-sm' : 'border-white/80 bg-black/40 text-transparent'
                      }`}
                    >
                      <Check size={11} strokeWidth={3} />
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDraft((d) => ({ ...d, media: d.media.filter((m) => m.id !== item.id) }));
                      }}
                      aria-label="Remove media"
                      className="absolute left-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100 hover:bg-[#be123c]"
                    >
                      <X size={11} />
                    </button>
                  </div>
                  <span className="mt-1.5 text-[11px] font-medium text-[#6d6e80]">{item.status || 'Ready'}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    );
  }

  /* ── PRODUCTS LIST VIEW (Aligned 1:1 with Projects Page) ── */
  return (
    <main className="nx-library nx-content-page !bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Products</h1>
          <p className="mt-1 text-[13.5px] text-[#6d6e80]">
            Save product details, media assets, and video settings to launch product ads faster.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-[36px] items-center gap-1.5 rounded-full border border-[#dfe0ea] bg-[#f4f4f7] px-4 text-[13px] font-semibold text-[#14141f] transition hover:border-[#cfd0de] hover:bg-[#e9e9f0]"
        >
          <Plus size={15} strokeWidth={2.2} />
          <span>Add Product</span>
        </button>
      </div>

      {/* All-Apps Style Pill Toolbar + Inline Search */}
      <div className="nx-apps-toolbar my-6">
        <div className="nx-apps-pill-bar" role="tablist" aria-label="Filter products by format">
          <button
            type="button"
            role="tab"
            aria-selected={aspectFilter === ''}
            onClick={() => setAspectFilter('')}
            className={`nx-apps-pill-tab${aspectFilter === '' ? ' is-active' : ''}`}
          >
            <span>All Products</span>
            <span className="nx-apps-pill-count">{products.length}</span>
          </button>
          {ASPECT_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              role="tab"
              aria-selected={aspectFilter === opt}
              onClick={() => setAspectFilter(opt)}
              className={`nx-apps-pill-tab${aspectFilter === opt ? ' is-active' : ''}`}
            >
              <span>{opt}</span>
            </button>
          ))}

          <div className="nx-apps-inline-search">
            <Search className="nx-apps-inline-search-icon w-3.5 h-3.5" aria-hidden="true" />
            <label htmlFor="nx-products-search" className="nx-reference-sr">Search products</label>
            <input
              id="nx-products-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products"
              className="nx-apps-inline-search-input"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="nx-apps-inline-search-clear"
                aria-label="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <select
          className="h-[36px] rounded-full border border-[#e5e5ee] bg-white px-3.5 text-[12.5px] font-medium text-[#3c3d4e] outline-none transition focus:border-[#cfd0de]"
          aria-label="Sort products"
          value={order}
          onChange={(e) => setOrder(e.target.value)}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      {error && (
        <p
          className="mb-4 rounded-xl border border-[#fecdd3] bg-[#fff1f2] px-4 py-2.5 text-[13px] text-[#be123c]"
          role="alert"
        >
          {error}
        </p>
      )}

      {!hydrated ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="nx-skel-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="nx-skel aspect-video" style={{ borderRadius: 0 }} />
              <div className="p-3.5 space-y-2">
                <div className="nx-skel h-4 w-3/4" />
                <div className="nx-skel h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#e4e5ef] bg-[#fafafc] px-6 py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-xl border border-[#e5e5ee] bg-white text-[#5c5d70]">
            <Package size={22} strokeWidth={1.8} />
          </span>
          <h2 className="mt-4 text-[15.5px] font-semibold text-[#14141f]">
            {search || aspectFilter ? 'No matching products' : 'No products saved yet'}
          </h2>
          <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-[#6d6e80]">
            Save your product name, key advantages, highlights, and media assets to launch product ads faster.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-5 inline-flex h-[36px] items-center gap-1.5 rounded-full border border-[#dfe0ea] bg-[#f4f4f7] px-4 text-[13px] font-semibold text-[#14141f] transition hover:border-[#cfd0de] hover:bg-[#e9e9f0]"
          >
            <Plus size={15} strokeWidth={2.2} />
            <span>Add First Product</span>
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProducts.map((product) => {
            const cover = product.media?.find((m) => m.selected) || product.media?.[0];
            const updatedLabel = formatDate(product.updatedAt || product.updated_at);
            return (
              <article
                key={product.id}
                className="group flex flex-col overflow-hidden rounded-xl border border-[#e6e7ef] bg-white transition hover:border-[#cfd0de] hover:shadow-[0_12px_26px_-14px_rgba(16,16,32,0.14)]"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openEdit(product)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openEdit(product);
                    }
                  }}
                  className="relative grid aspect-video w-full place-items-center overflow-hidden bg-[#f4f5f8] cursor-pointer"
                >
                  {cover ? (
                    cover.kind === 'video' ? (
                      <video src={cover.url} muted playsInline className="h-full w-full object-cover" />
                    ) : (
                      <img
                        src={cover.url}
                        alt={product.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    )
                  ) : (
                    <Package size={26} strokeWidth={1.6} className="text-[#9a9bac]" aria-hidden="true" />
                  )}
                  <span className="absolute left-2.5 top-2.5 rounded-md bg-white/90 px-2 py-0.5 text-[10.5px] font-medium text-[#14141f] backdrop-blur-sm">
                    {product.aspectRatio} · {product.duration}
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-3.5">
                  <small className="text-[11.5px] text-[#7a7b8c]">
                    {product.language || 'Indonesian'}
                    {updatedLabel ? ` · ${updatedLabel}` : ''}
                  </small>
                  <h3 className="mt-0.5 truncate text-[14.5px] font-semibold text-[#14141f]" title={product.name}>
                    {product.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-[#66677a]">
                    {product.advantages || 'No advantages added yet.'}
                  </p>
                  {product.highlights?.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {product.highlights.slice(0, 3).map((h) => (
                        <span
                          key={h}
                          className="rounded-md border border-[#ebebf2] bg-[#f6f6fa] px-2 py-0.5 text-[10.5px] font-medium text-[#4a4b5c]"
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-auto flex items-center gap-1.5 border-t border-[#f1f1f6] px-3.5 py-2.5">
                  <button
                    type="button"
                    onClick={() => onNavigate?.('director', buildBrief(product))}
                    className="flex-1 inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-[#dfe0ea] bg-[#f4f4f7] px-3 text-[12px] font-semibold text-[#14141f] transition hover:border-[#cfd0de] hover:bg-[#e9e9f0]"
                  >
                    <Play size={11} fill="currentColor" />
                    <span>Make Video</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(product)}
                    aria-label={`Edit ${product.name}`}
                    title="Edit product"
                    className="grid h-8 w-8 place-items-center rounded-lg border border-[#e5e5ee] bg-white text-[#5c5d70] transition hover:border-[#cfd0de] hover:bg-[#f6f6fa] hover:text-[#14141f]"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    disabled={product.canDelete === false}
                    onClick={() => deleteProduct(product.id)}
                    aria-label={`Delete ${product.name}`}
                    title="Delete product"
                    className="grid h-8 w-8 place-items-center rounded-lg border border-[#e5e5ee] bg-white text-[#5c5d70] transition hover:border-[#fecdd3] hover:bg-[#fff1f2] hover:text-[#be123c]"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
