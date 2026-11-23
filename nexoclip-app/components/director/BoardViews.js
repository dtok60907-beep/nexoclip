'use client';

// Views of the Director's project board. Every item can be edited and locked
// directly; edits go through the same validation as the agent's tools.

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ExternalLink, FileText, Lock, Sparkles, Unlock, X } from 'lucide-react';

export const fmtCredits = (value) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

export function Badge({ children, tone = 'default' }) {
  const tones = {
    default: 'border-[#E6E7F0] bg-[#F3F4F8] text-[#4C4D61]',
    accent: 'border-[#DDD7FE] bg-[#F2F0FF] text-[#4C38D6]',
    amber: 'border-[#FCE0B0] bg-[#FFF8EB] text-[#A05C07]',
    green: 'border-[#C5F0D6] bg-[#ECFDF3] text-[#147A49]',
    red: 'border-[#FCCDD6] bg-[#FFF1F3] text-[#C01048]',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium leading-tight ${tones[tone] || tones.default}`}>
      {children}
    </span>
  );
}

function Section({ title, children, action }) {
  return (
    <section className="mb-7 last:mb-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#5E5E72]">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#D5D7E4] bg-[#FAFAFD] px-6 py-10 text-center text-[13.5px] leading-relaxed text-[#5E5E72]">
      {children}
    </div>
  );
}

export const inputClass =
  'w-full rounded-xl border border-[#D8DAE6] bg-white px-3.5 py-2.5 text-[13.5px] text-[#14141F] placeholder:text-[#8A8B9C] outline-none transition focus:border-[#5B45F2] focus:ring-4 focus:ring-[#5B45F2]/10 disabled:bg-[#F5F6FA] disabled:text-[#8A8B9C]';

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-[#4C4D61]">{label}</span>
      {children}
    </label>
  );
}

export function SmallButton({ children, onClick, disabled, tone = 'default', title, className = '' }) {
  const tones = {
    default:
      'border-[#D8DAE6] bg-white text-[#2D2E3F] hover:border-[#BFC2D4] hover:bg-[#F7F8FA] hover:text-[#14141F]',
    accent:
      'border-[#5B45F2] bg-[#5B45F2] text-white font-semibold shadow-[0_1px_2px_rgba(91,69,242,0.22)] hover:border-[#4731D8] hover:bg-[#4731D8]',
    soft:
      'border-[#DDD7FE] bg-[#F2F0FF] text-[#4C38D6] font-medium hover:bg-[#E6E2FF]',
    danger:
      'border-[#F6C8D2] bg-white text-[#C01048] hover:border-[#E89CAE] hover:bg-[#FFF1F3]',
  };
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-[12.5px] font-medium transition disabled:pointer-events-none disabled:opacity-45 ${tones[tone] || tones.default} ${className}`}
    >
      {children}
    </button>
  );
}

export function LockButton({ locked, onToggle, disabled }) {
  return (
    <SmallButton
      onClick={onToggle}
      disabled={disabled}
      tone={locked ? 'soft' : 'default'}
      title={locked ? 'Locked: Director will not change this. Click to unlock.' : 'Lock so Director will not change this'}
    >
      {locked ? <Lock size={13} strokeWidth={2.1} aria-hidden="true" /> : <Unlock size={13} strokeWidth={2} aria-hidden="true" />}
      <span>{locked ? 'Locked' : 'Lock'}</span>
    </SmallButton>
  );
}

// ---------------------------------------------------------------- media

const MEDIA_STATUS = {
  none: { label: 'Not generated', tone: 'default' },
  running: { label: 'Processing', tone: 'amber' },
  succeeded: { label: 'Done', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
};

export function mediaStatus(media) {
  if (!media) return MEDIA_STATUS.none;
  if (media.stale) return { label: 'Needs regenerate', tone: 'amber' };
  return MEDIA_STATUS[media.status] || MEDIA_STATUS.none;
}

export function assetUrl(assetId, workspaceId, thumb = false) {
  if (!assetId || !workspaceId) return null;
  const params = new URLSearchParams({ workspace_id: workspaceId });
  if (thumb) params.set('variant', 'thumb');
  return `/api/assets/${encodeURIComponent(assetId)}/download?${params}`;
}

function MediaFrame({ media, aspect = 'aspect-video', label, workspaceId }) {
  const busy = media?.status === 'running';
  const full = assetUrl(media?.asset_id, workspaceId);
  return (
    <div className={`${aspect} relative flex items-center justify-center overflow-hidden bg-[#11141C]`}>
      {full && media.kind === 'video' ? (
        <video src={full} controls preload="metadata" className="h-full w-full object-cover" />
      ) : full ? (
        <a href={full} target="_blank" rel="noreferrer" className="h-full w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetUrl(media.asset_id, workspaceId, true)}
            alt={label}
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]"
            loading="lazy"
            onError={(event) => {
              if (!event.currentTarget.dataset.full) {
                event.currentTarget.dataset.full = '1';
                event.currentTarget.src = full;
              }
            }}
          />
        </a>
      ) : (
        <span className={`text-[12px] font-medium ${busy ? 'animate-pulse text-amber-300' : 'text-white/45'}`}>
          {busy ? 'Generating…' : media?.kind === 'video' ? 'No video yet' : 'No reference sheet yet'}
        </span>
      )}
      {media && (media.stale || media.status === 'failed') && (
        <span className="absolute left-2.5 top-2.5">
          <Badge tone={mediaStatus(media).tone}>{mediaStatus(media).label}</Badge>
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- brief

// brief.look: how the whole video is rendered (sheets, frames and clips follow it).
// Same keys and order as BRIEF_DETAILS in director_service/board.py.
// ASPECT_RATIOS / RESOLUTIONS in director_service/board.py
export const RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'];
export const RESOLUTIONS = ['480p', '720p', '1080p'];
// VIDEO_MODELS in director_service/board.py: the clip model a project uses, and the resolutions it makes.
export const VIDEO_MODELS = {
  'seedance-2.5': { label: 'Seedance 2.5', resolutions: ['480p', '720p', '1080p'], maxSeconds: 30 },
  'seedance-2.0': { label: 'Seedance 2.0', resolutions: ['720p', '1080p'], maxSeconds: 15 },
};

export const BRIEF_DETAIL_LABELS = {
  goal: 'Goal',
  audience: 'Target audience',
  platform: 'Platform',
  key_message: 'Key message',
  product: 'Product / brand',
  tone: 'Mood & tone',
  references: 'References',
  cta: 'Closing / CTA',
  must_have: 'Must-haves',
  avoid: 'Avoid',
};

export const LOOK_LABELS = {
  realistic: 'Realistic',
  '3d_animation': '3D Animation',
  anime: 'Anime',
  illustration: 'Illustration',
  other: 'Other',
};

export function BriefView({ board, onEdit, busy }) {
  const brief = board.brief || {};
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(brief);
  useEffect(() => {
    if (!editing) setDraft(brief);
  }, [brief, editing]);

  const save = async () => {
    const ok = await onEdit('update_brief', {
      summary: draft.summary || '',
      ...Object.fromEntries(Object.keys(BRIEF_DETAIL_LABELS).map((k) => [k, draft[k] || ''])),
      ...(draft.look ? { look: draft.look } : {}),
      aspect_ratio: draft.aspect_ratio,
      style: draft.style || '',
      resolution: draft.resolution,
      generate_audio: !!draft.generate_audio,
      ...(draft.duration_seconds ? { duration_seconds: Number(draft.duration_seconds) } : {}),
    });
    if (ok) setEditing(false);
  };

  const actions = (
    <div className="flex items-center gap-2">
      {!editing && (
        <SmallButton onClick={() => setEditing(true)} disabled={busy}>
          Edit brief
        </SmallButton>
      )}
      <LockButton
        locked={brief.locked}
        disabled={busy}
        onToggle={() => onEdit('set_lock', { target: 'brief', locked: !brief.locked })}
      />
    </div>
  );

  if (editing) {
    return (
      <Section title="Brief" action={actions}>
        <div className="space-y-4 rounded-2xl border border-[#E8E9F0] bg-[#FAFAFD] p-5">
          <Field label="Summary">
            <textarea
              rows={4}
              className={inputClass}
              value={draft.summary || ''}
              onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Object.entries(BRIEF_DETAIL_LABELS).map(([key, label]) => (
              <Field key={key} label={label}>
                <textarea
                  rows={2}
                  className={inputClass}
                  value={draft[key] || ''}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Aspect ratio">
              <select
                className={inputClass}
                value={draft.aspect_ratio}
                onChange={(e) => setDraft({ ...draft, aspect_ratio: e.target.value })}
              >
                {RATIOS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Duration (seconds)">
              <input
                type="number"
                min={4}
                max={600}
                className={inputClass}
                value={draft.duration_seconds || ''}
                onChange={(e) => setDraft({ ...draft, duration_seconds: e.target.value })}
              />
            </Field>
            <Field label="Resolution">
              <select
                className={inputClass}
                value={draft.resolution}
                onChange={(e) => setDraft({ ...draft, resolution: e.target.value })}
              >
                {(VIDEO_MODELS[draft.video_model] || VIDEO_MODELS['seedance-2.5']).resolutions.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Native audio">
              <select
                className={inputClass}
                value={draft.generate_audio ? '1' : '0'}
                onChange={(e) => setDraft({ ...draft, generate_audio: e.target.value === '1' })}
              >
                <option value="0">No audio</option>
                <option value="1">With audio</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Visual look">
              <select
                className={inputClass}
                value={draft.look || ''}
                onChange={(e) => setDraft({ ...draft, look: e.target.value })}
              >
                {!draft.look && <option value="">Not selected</option>}
                {Object.entries(LOOK_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Visual style">
              <input
                className={inputClass}
                value={draft.style || ''}
                onChange={(e) => setDraft({ ...draft, style: e.target.value })}
              />
            </Field>
          </div>
          {draft.look && draft.look !== brief.look && brief.look && (
            <p className="rounded-xl border border-[#FCE0B0] bg-[#FFF8EB] px-3.5 py-2.5 text-[12.5px] text-[#A05C07]">
              Changing the visual look automatically regenerates all reference sheets (uses credits), and frames/videos will need to be regenerated.
            </p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <SmallButton tone="accent" onClick={save} disabled={busy}>
              Save brief
            </SmallButton>
            <SmallButton onClick={() => setEditing(false)}>Cancel</SmallButton>
          </div>
        </div>
      </Section>
    );
  }

  if (!brief.summary) {
    return (
      <Section title="Brief" action={actions}>
        <Empty>No brief yet. Tell the Director what video you want to create.</Empty>
      </Section>
    );
  }

  const specs = [
    { label: 'Look', value: brief.look ? LOOK_LABELS[brief.look] || brief.look : 'Not selected', warn: !brief.look },
    { label: 'Aspect ratio', value: brief.aspect_ratio || '—' },
    { label: 'Duration', value: brief.duration_seconds ? `${brief.duration_seconds}s` : 'Flexible' },
    { label: 'Resolution', value: brief.resolution || '—' },
    { label: 'Audio', value: brief.generate_audio ? 'Native enabled' : 'No audio' },
  ];

  const detailEntries = Object.entries(BRIEF_DETAIL_LABELS).filter(([k]) => brief[k]);

  return (
    <div className="space-y-6">
      {/* Top Format Specification Strip */}
      <Section title="Production Specifications" action={actions}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          {specs.map((item) => (
            <div
              key={item.label}
              className={`rounded-xl border px-3.5 py-3 ${
                item.warn ? 'border-[#FCE0B0] bg-[#FFFBF2]' : 'border-[#E6E7F0] bg-white'
              }`}
            >
              <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#7A7B90]">{item.label}</div>
              <div
                className={`mt-1 truncate text-[13.5px] font-semibold ${
                  item.warn ? 'text-[#A05C07]' : 'text-[#14141F]'
                }`}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Editorial Brief Summary Sheet */}
      <Section title="Brief Summary">
        <div className="overflow-hidden rounded-2xl border border-[#E6E7F0] bg-white shadow-[0_1px_4px_rgba(20,20,31,0.03)]">
          <div className="p-5 sm:p-6">
            <p className="whitespace-pre-line text-[14.5px] leading-[1.78] text-[#1E1E28]">{brief.summary}</p>
          </div>
          {brief.style && (
            <div className="border-t border-[#EFEFF5] bg-[#FAFAFD] px-5 py-3.5 sm:px-6">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-[#4C38D6]">Visual style</span>
              <p className="mt-1 text-[13.5px] leading-relaxed text-[#3A3B4C]">{brief.style}</p>
            </div>
          )}
        </div>
      </Section>

      {/* Structured Strategy Details Grid */}
      {detailEntries.length > 0 && (
        <Section title="Strategy & Direction">
          <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {detailEntries.map(([key, label]) => {
              const isAvoid = key === 'avoid';
              const isMust = key === 'must_have';
              return (
                <div
                  key={key}
                  className={`rounded-xl border p-4 ${
                    isAvoid
                      ? 'border-[#F7D4DC] bg-[#FFF8F9]'
                      : isMust
                      ? 'border-[#DDD7FE] bg-[#F8F7FF]'
                      : 'border-[#E6E7F0] bg-white'
                  }`}
                >
                  <dt
                    className={`text-[11px] font-semibold uppercase tracking-[0.05em] ${
                      isAvoid ? 'text-[#B4234B]' : isMust ? 'text-[#4C38D6]' : 'text-[#6E6F82]'
                    }`}
                  >
                    {label}
                  </dt>
                  <dd className="mt-1.5 whitespace-pre-line text-[13.5px] leading-[1.65] text-[#2D2E3F]">
                    {brief[key]}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- concepts

export function ConceptsView({ board, onEdit, onChooseConcept, busy }) {
  const concepts = board.concepts || { options: [] };
  if (!concepts.options?.length) {
    return <Empty>No concepts yet. Ask the Director to propose a few creative directions.</Empty>;
  }
  const canChoose = !busy && !concepts.locked;
  return (
    <Section
      title={`Creative Direction · ${concepts.options.length} ${concepts.options.length === 1 ? 'Option' : 'Options'}`}
      action={
        <LockButton
          locked={concepts.locked}
          disabled={busy}
          onToggle={() => onEdit('set_lock', { target: 'concepts', locked: !concepts.locked })}
        />
      }
    >
      <p className="mb-4 text-[13.5px] leading-relaxed text-[#5E5E72]">
        Choose one of the creative directions below. The Director will draft the script and shot plan based on your choice.
      </p>
      <div className="space-y-4">
        {concepts.options.map((option, index) => {
          const chosen = concepts.chosen === option.id;
          const recommended = concepts.recommended === option.id;
          const clickable = canChoose && !chosen;
          return (
            <button
              key={option.id}
              type="button"
              disabled={!clickable}
              onClick={() => onChooseConcept(option)}
              className={`group block w-full overflow-hidden rounded-2xl border text-left transition ${
                chosen
                  ? 'border-[#5B45F2] bg-[#F8F7FF] ring-2 ring-[#5B45F2]/15'
                  : clickable
                  ? 'border-[#E6E7F0] bg-white shadow-[0_2px_8px_rgba(20,20,31,0.03)] hover:border-[#B9AEFC] hover:shadow-[0_10px_24px_-14px_rgba(91,69,242,0.25)]'
                  : 'cursor-default border-[#E6E7F0] bg-[#FAFAFD]'
              }`}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`inline-flex h-7 w-7 flex-none items-center justify-center rounded-lg text-[12px] font-bold ${
                        chosen ? 'bg-[#5B45F2] text-white' : 'bg-[#F2F0FF] text-[#4C38D6]'
                      }`}
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="text-[16px] font-semibold tracking-[-0.015em] text-[#14141F]">{option.title}</div>
                  </div>
                  <div className="flex flex-none items-center gap-1.5">
                    {recommended && (
                      <Badge tone="accent">
                        <Sparkles size={11} aria-hidden="true" />
                        <span>Recommended</span>
                      </Badge>
                    )}
                    {chosen && (
                      <Badge tone="green">
                        <Check size={11} strokeWidth={2.5} aria-hidden="true" />
                        <span>Selected</span>
                      </Badge>
                    )}
                  </div>
                </div>

                <p className="mt-3 text-[14px] leading-[1.68] text-[#2D2E3F]">{option.logline}</p>

                {(option.approach || option.why) && (
                  <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {option.approach && (
                      <div className="rounded-xl border border-[#ECECF4] bg-[#FAFAFD] p-3.5">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6E6F82]">
                          Visual Approach
                        </div>
                        <p className="mt-1 text-[13px] leading-relaxed text-[#3A3B4C]">{option.approach}</p>
                      </div>
                    )}
                    {option.why && (
                      <div className="rounded-xl border border-[#ECECF4] bg-[#FAFAFD] p-3.5">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6E6F82]">
                          Why It Fits
                        </div>
                        <p className="mt-1 text-[13px] leading-relaxed text-[#3A3B4C]">{option.why}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div
                className={`flex items-center justify-between border-t px-5 py-2.5 text-[12px] font-semibold ${
                  chosen
                    ? 'border-[#DDD7FE] bg-[#F2F0FF] text-[#4C38D6]'
                    : clickable
                    ? 'border-[#EFEFF5] bg-[#FAFAFD] text-[#5E5E72] group-hover:bg-[#F2F0FF] group-hover:text-[#4C38D6]'
                    : 'border-[#EFEFF5] bg-[#F7F8FA] text-[#8A8B9C]'
                }`}
              >
                <span>
                  {chosen
                    ? 'Currently using this concept'
                    : clickable
                    ? 'Select this concept to continue to script'
                    : concepts.locked
                    ? 'Concept selection is locked'
                    : 'Waiting for current process to finish'}
                </span>
                {clickable && <ArrowRight size={14} strokeWidth={2.1} aria-hidden="true" />}
              </div>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- assets (elements)

// The user's own photos of an element (product, logo, face, place). The sheet is regenerated from them.
const MAX_ELEMENT_PHOTOS = 4; // MAX_ELEMENT_PHOTOS in director_service/board.py

function ElementPhotos({ item, onEdit, busy, workspaceId }) {
  const photos = item.photos || [];
  const input = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const upload = async (files) => {
    const room = MAX_ELEMENT_PHOTOS - photos.length;
    const picked = [...files].filter((f) => f.type.startsWith('image/')).slice(0, room);
    if (!picked.length) return;
    setUploading(true);
    setError('');
    try {
      const ids = [];
      for (const file of picked) {
        const body = new FormData();
        body.append('file', file);
        const res = await fetch('/api/uploads', { method: 'POST', headers: { 'x-workspace-id': workspaceId }, body });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.id) throw new Error(data.error || 'Upload failed');
        ids.push(data.id);
      }
      await onEdit('set_element_photos', { id: item.id, photos: [...photos, ...ids] });
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        {photos.map((id) => (
          <div key={id} className="group relative h-12 w-12 overflow-hidden rounded-lg border border-[#DCDDE8] bg-[#F5F6FA]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assetUrl(id, workspaceId, true)} alt="Reference photo" className="h-full w-full object-cover" />
            <button
              type="button"
              disabled={busy || uploading}
              aria-label="Remove photo"
              onClick={() => onEdit('set_element_photos', { id: item.id, photos: photos.filter((p) => p !== id) })}
              className="absolute right-0.5 top-0.5 hidden h-5 w-5 items-center justify-center rounded-full bg-black/75 text-white group-hover:flex"
            >
              <X size={11} strokeWidth={2.4} />
            </button>
          </div>
        ))}
        {photos.length < MAX_ELEMENT_PHOTOS && (
          <SmallButton disabled={busy || uploading || item.locked} onClick={() => input.current?.click()}>
            {uploading ? 'Uploading…' : photos.length ? '+ Photo' : '+ Real photo'}
          </SmallButton>
        )}
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
      {photos.length > 0 && (
        <p className="mt-1.5 text-[11.5px] text-[#7A7B90]">
          Sheet is generated from these photos: click Regenerate sheet (uses credits).
        </p>
      )}
      {error && <p className="mt-1.5 text-[12px] text-[#C01048]">{error}</p>}
    </div>
  );
}

function ElementCard({ item, board, onEdit, onRequest, busy, workspaceId }) {
  const media = board.media[`element:${item.id}`];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item);
  useEffect(() => {
    if (!editing) setDraft(item);
  }, [item, editing]);
  const save = async () => {
    if (await onEdit('upsert_element', { id: item.id, kind: item.kind, name: draft.name, description: draft.description })) {
      setEditing(false);
    }
  };
  const generated = media?.asset_id && !media.stale;
  const st = mediaStatus(media);
  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-white shadow-[0_1px_3px_rgba(20,20,31,0.03)] transition ${
        item.locked ? 'border-[#BCEAD0]' : 'border-[#E6E7F0]'
      }`}
    >
      <MediaFrame media={media} workspaceId={workspaceId} label={`${item.name} reference sheet`} aspect="aspect-video" />
      <div className="p-4">
        {editing ? (
          <div className="space-y-3">
            <Field label="Asset name">
              <input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Visual description">
              <textarea
                rows={4}
                className={inputClass}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
            <div className="flex gap-2">
              <SmallButton tone="accent" onClick={save} disabled={busy}>
                Save
              </SmallButton>
              <SmallButton onClick={() => setEditing(false)}>Cancel</SmallButton>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-[14.5px] font-semibold text-[#14141F]">{item.name}</div>
              <Badge tone={st.tone}>{st.label}</Badge>
            </div>
            {item.variant_of && (
              <p className="mt-1 text-[12px] text-[#7A7B90]">
                Variant of {(board.elements.find((e) => e.id === item.variant_of) || {}).name || item.variant_of}
              </p>
            )}
            <p className="mt-2 line-clamp-4 whitespace-pre-line text-[13px] leading-relaxed text-[#5E5E72]" title={item.description}>
              {item.description}
            </p>
            <ElementPhotos item={item} onEdit={onEdit} busy={busy} workspaceId={workspaceId} />
            <div className="mt-4 flex flex-wrap gap-2 border-t border-[#F0F1F6] pt-3">
              <SmallButton
                tone={media?.asset_id ? 'default' : 'soft'}
                onClick={() => onRequest([`element:${item.id}`], !!generated)}
                disabled={busy || media?.in_request}
              >
                {media?.asset_id ? 'Regenerate sheet' : 'Generate sheet'}
              </SmallButton>
              <SmallButton onClick={() => setEditing(true)} disabled={busy}>
                Edit
              </SmallButton>
              <LockButton
                locked={item.locked}
                disabled={busy}
                onToggle={() => onEdit('set_lock', { target: `element:${item.id}`, locked: !item.locked })}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function AssetsView({ board, onEdit, onRequest, busy, workspaceId }) {
  if (!board.elements.length) {
    return <Empty>No characters, locations, or props for this story yet.</Empty>;
  }
  // Sheets already being made (or waiting in a request) are not offered again.
  const making = board.elements.filter((e) => {
    const m = board.media[`element:${e.id}`];
    return m?.in_request || m?.status === 'running';
  });
  const missing = board.elements.filter((e) => {
    const m = board.media[`element:${e.id}`];
    return (!m?.asset_id || m.stale) && !making.includes(e);
  });
  const groups = [
    ['character', 'Characters'],
    ['location', 'Locations'],
    ['prop', 'Props'],
  ];
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E8E9F0] bg-[#F8F8FC] px-4 py-3.5">
        <p className="text-[13.5px] leading-relaxed text-[#4C4D61]">
          Each asset is created as a single reference sheet to keep its appearance consistent across all shots.
        </p>
        {making.length > 0 ? (
          <SmallButton disabled>Generating {making.length} {making.length === 1 ? 'sheet' : 'sheets'}…</SmallButton>
        ) : (
          missing.length > 0 && (
            <SmallButton tone="accent" disabled={busy} onClick={() => onRequest(missing.map((e) => `element:${e.id}`))}>
              Generate {missing.length} {missing.length === 1 ? 'sheet' : 'sheets'}
            </SmallButton>
          )
        )}
      </div>
      {groups.map(([kind, label]) => {
        const items = board.elements.filter((e) => e.kind === kind);
        if (!items.length) return null;
        return (
          <Section key={kind} title={`${label} (${items.length})`}>
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((item) => (
                <ElementCard
                  key={item.id}
                  item={item}
                  board={board}
                  onEdit={onEdit}
                  onRequest={onRequest}
                  busy={busy}
                  workspaceId={workspaceId}
                />
              ))}
            </div>
          </Section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- script

export function ScriptView({ board, onEdit, onConfirmScript, busy }) {
  const script = board.script;
  const [draft, setDraft] = useState(script || { title: '', text: '' });
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft(script || { title: '', text: '' });
  }, [script, dirty]);
  const save = async () => {
    if (await onEdit('write_script', { title: draft.title, text: draft.text })) setDirty(false);
  };
  const change = (patch) => {
    setDraft({ ...draft, ...patch });
    setDirty(true);
  };
  const lines = (draft.text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean).length;
  const words = (draft.text || '').trim() ? (draft.text || '').trim().split(/\s+/).length : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E6E7F0] bg-white shadow-[0_2px_10px_rgba(20,20,31,0.035)]">
      {/* Integrated Script Document Header */}
      <div className="border-b border-[#EFEFF5] bg-[#FAFAFD] px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-[#4C38D6]">
            <FileText size={13.5} strokeWidth={2.1} aria-hidden="true" />
            <span>Script Document</span>
            {dirty ? (
              <Badge tone="amber">Unsaved changes</Badge>
            ) : script?.locked ? (
              <Badge tone="green">Confirmed</Badge>
            ) : draft.text.trim() ? (
              <Badge>Draft</Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-2.5">
            {words > 0 && (
              <span className="text-[11.5px] font-medium text-[#7A7B90]">
                {lines} {lines === 1 ? 'line' : 'lines'} · {words} {words === 1 ? 'word' : 'words'}
              </span>
            )}
            {script && (
              <LockButton
                locked={script.locked}
                disabled={busy}
                onToggle={() => onEdit('set_lock', { target: 'script', locked: !script.locked })}
              />
            )}
          </div>
        </div>
        <input
          className="mt-2.5 block w-full bg-transparent text-[19px] font-semibold tracking-[-0.02em] text-[#14141F] outline-none placeholder:text-[#9A9BAC]"
          placeholder="Script title…"
          aria-label="Script title"
          value={draft.title}
          onChange={(e) => change({ title: e.target.value })}
        />
      </div>

      {/* Spacious Document Writing Surface */}
      <div className="px-5 py-4 sm:px-6 sm:py-5">
        <textarea
          rows={20}
          aria-label="Script content"
          className="block w-full resize-y bg-transparent text-[14.5px] leading-[1.82] text-[#1E1E28] outline-none placeholder:text-[#9A9BAC]"
          placeholder="No script written yet. Ask the Director to write one, or type directly here…"
          value={draft.text}
          onChange={(e) => change({ text: e.target.value })}
        />
      </div>

      {/* Clean Document Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EFEFF5] bg-[#FAFAFD] px-5 py-3.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? (
            <>
              <SmallButton onClick={save} disabled={busy || !draft.text.trim()}>
                Save script
              </SmallButton>
              <SmallButton onClick={() => setDirty(false)}>Discard changes</SmallButton>
            </>
          ) : (
            <span className="text-[12px] text-[#6E6F82]">
              {script?.locked
                ? 'Script is locked and ready to use as the shot reference.'
                : 'Click the text above anytime to edit directly.'}
            </span>
          )}
        </div>

        {(script || dirty) &&
          draft.text.trim() &&
          (script?.locked && !dirty ? (
            <Badge tone="green">
              <Check size={11.5} strokeWidth={2.5} aria-hidden="true" />
              <span>Script confirmed</span>
            </Badge>
          ) : (
            <SmallButton
              tone="accent"
              disabled={busy}
              onClick={() => onConfirmScript({ title: draft.title, text: draft.text }, dirty, () => setDirty(false))}
            >
              Confirm script
            </SmallButton>
          ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- research

export function ResearchView({ board }) {
  if (!board.research.length) {
    return <Empty>No research yet. Ask the Director to research references whenever needed.</Empty>;
  }
  return (
    <div className="space-y-4">
      {[...board.research].reverse().map((item) => (
        <div key={item.id} className="rounded-2xl border border-[#E8E9F0] bg-white p-5 shadow-[0_1px_2px_rgba(20,20,31,0.03)]">
          <div className="text-[15px] font-semibold text-[#14141F]">{item.query}</div>
          <p className="mt-2.5 whitespace-pre-line text-[13.5px] leading-[1.7] text-[#3A3B4C]">{item.notes}</p>
          {item.sources.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2 border-t border-[#F0F1F6] pt-3">
              {item.sources.map((url) => {
                let host = url;
                try {
                  host = new URL(url).hostname.replace(/^www\./, '');
                } catch {
                  /* keep raw */
                }
                return (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 rounded-full border border-[#DDD7FE] bg-[#F2F0FF] px-3 py-1 text-[12px] font-medium text-[#4C38D6] transition hover:bg-[#E6E2FF]"
                    >
                      <span>{host}</span>
                      <ExternalLink size={11} aria-hidden="true" />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- history

export function HistoryView({ board, busy, loadVersions, onRestore }) {
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    loadVersions()
      .then((list) => {
        if (!cancelled) setVersions(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [loadVersions, board.version]);
  if (error) return <p className="rounded-xl border border-[#FCCDD6] bg-[#FFF1F3] px-4 py-3 text-[13px] text-[#C01048]">{error}</p>;
  if (!versions) return <p className="text-[13px] text-[#5E5E72]">Loading history…</p>;
  const authors = { agent: 'Director', user: 'You', system: 'System' };
  return (
    <Section title={`History · current version v${board.version}`}>
      <ul className="divide-y divide-[#EFEFF5] overflow-hidden rounded-2xl border border-[#E8E9F0] bg-white">
        {versions.map((v) => (
          <li key={v.version} className="flex items-center justify-between gap-4 px-4 py-3.5 transition hover:bg-[#FAFAFD]">
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-medium text-[#14141F]">
                <span className="mr-2 inline-block rounded-md bg-[#F2F3F7] px-1.5 py-0.5 font-mono text-[11.5px] font-semibold tabular-nums text-[#5E5E72]">
                  v{v.version}
                </span>
                {v.summary}
              </div>
              <div className="mt-1 text-[12px] text-[#7A7B90]">
                {authors[v.author] || v.author} · {new Date(v.created_at).toLocaleString('en-US')}
              </div>
            </div>
            {v.version === board.version ? (
              <Badge tone="accent">Current</Badge>
            ) : (
              <SmallButton disabled={busy} onClick={() => onRestore(v.version)}>
                Restore
              </SmallButton>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12.5px] leading-relaxed text-[#7A7B90]">
        Restoring an older version creates a new version, so nothing is lost. Images/videos that no longer match are marked “Needs regenerate”.
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------- audio

const CHARS_PER_SECOND = 13; // roughly how fast an Indonesian voiceover reads

function AudioTrack({ title, mediaKey, media, workspaceId, onEdit, onRequest, busy, canGenerate, children }) {
  const src = assetUrl(media?.asset_id, workspaceId);
  const takes = media?.takes || [];
  const fresh = !!media?.asset_id && !media?.stale;
  const st = mediaStatus(media);
  return (
    <div className="space-y-3.5 rounded-2xl border border-[#E8E9F0] bg-white p-5 shadow-[0_1px_2px_rgba(20,20,31,0.03)]">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[14.5px] font-semibold text-[#14141F]">{title}</div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      {children}
      {src && <audio key={src} src={src} controls className="h-10 w-full" />}
      {takes.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-[#5E5E72]">
          <span className="font-medium">Take</span>
          {takes.map((take, i) => (
            <button
              key={take.asset_id}
              type="button"
              disabled={busy || take.asset_id === media.asset_id}
              onClick={() => onEdit('use_take', { key: mediaKey, asset_id: take.asset_id })}
              className={`rounded-lg border px-2.5 py-1 text-[12px] font-medium transition ${
                take.asset_id === media.asset_id
                  ? 'border-[#DDD7FE] bg-[#F2F0FF] text-[#4C38D6]'
                  : 'border-[#E6E7F0] bg-[#FAFAFD] text-[#4C4D61] hover:bg-[#F3F4F8]'
              }`}
            >
              {takes.length - i}
              {take.outdated ? ' · outdated' : ''}
            </button>
          ))}
        </div>
      )}
      {media?.error && <p className="text-[12.5px] text-[#C01048]">{media.error}</p>}
      <SmallButton tone="accent" disabled={busy || !canGenerate || media?.in_request} onClick={() => onRequest([mediaKey], fresh)}>
        {media?.asset_id ? 'Regenerate' : 'Generate'} {title.toLowerCase()}
      </SmallButton>
    </div>
  );
}

/** The Director's audio proposals (set_audio_options): pick one, or none. Picking fills in the VO and music below. */
function AudioOptions({ board, onChooseAudio, busy }) {
  const audio = board.audio || {};
  if (!audio.options?.length) return null;
  const title = (id) => board.shots.find((s) => s.id === id)?.title || id;
  return (
    <div className="space-y-3 rounded-2xl border border-[#E8E9F0] bg-white p-5 shadow-[0_1px_2px_rgba(20,20,31,0.03)]">
      <div className="text-[14.5px] font-semibold text-[#14141F]">Director Proposals</div>
      <div className="space-y-3">
        {audio.options.map((o) => {
          const chosen = audio.chosen === o.id;
          return (
            <div
              key={o.id}
              className={`rounded-xl border p-4 transition ${
                chosen ? 'border-[#5B45F2] bg-[#F6F4FF]' : 'border-[#E6E7F0] bg-[#FAFAFD]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-[#14141F]">
                    <span>{o.title}</span>
                    {audio.recommended === o.id && <Badge tone="accent">Recommended</Badge>}
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-[#5E5E72]">{o.why}</p>
                </div>
                <SmallButton tone={chosen ? 'soft' : 'accent'} disabled={busy || chosen} onClick={() => onChooseAudio(o)}>
                  {chosen ? 'Selected' : 'Use'}
                </SmallButton>
              </div>
              {o.voiceover_lines?.length ? (
                <div className="mt-3 space-y-1 border-t border-[#ECECF4] pt-2.5 text-[12.5px]">
                  <p className="font-medium text-[#5E5E72]">
                    VO · {o.voice_name || 'voice'} · {o.voiceover_lines.length} {o.voiceover_lines.length === 1 ? 'line' : 'lines'}
                  </p>
                  {o.voiceover_lines.map((l) => (
                    <p key={l.shot_id} className="text-[#323344]">
                      <span className="font-medium text-[#7A7B90]">{title(l.shot_id)}: </span>
                      {l.text}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-2.5 text-[12.5px] text-[#7A7B90]">No voiceover</p>
              )}
              {o.music_prompt && (
                <p className="mt-2 text-[12.5px] text-[#323344]">
                  <span className="font-medium text-[#7A7B90]">Music: </span>
                  {o.music_prompt}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        disabled={busy || audio.chosen === 'none'}
        onClick={() => onChooseAudio(null)}
        className="text-[12.5px] font-medium text-[#5E5E72] underline-offset-4 hover:text-[#14141F] hover:underline disabled:no-underline disabled:opacity-60"
      >
        {audio.chosen === 'none' ? 'No VO & music (selected)' : 'Skip VO & music'}
      </button>
    </div>
  );
}

export function AudioView({ board, onEdit, onRequest, onChooseAudio, busy, workspaceId }) {
  const audio = board.audio || { voiceover: {}, music: {} };
  const [voices, setVoices] = useState([]);
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    fetch('/api/director/voices')
      .then((r) => (r.ok ? r.json() : { voices: [] }))
      .then((d) => setVoices(d.voices || []))
      .catch(() => {});
  }, []);
  const current = {
    voice_id: audio.voiceover?.voice_id || '',
    lines: Object.fromEntries(board.shots.map((s) => [s.id, { text: s.vo_text || '', offset: s.vo_offset ?? 0.3 }])),
    music_prompt: audio.music?.prompt || '',
    music_seconds: audio.music?.duration_seconds || '',
    instrumental: audio.music?.instrumental !== false,
  };
  const value = draft || current;
  const change = (patch) => setDraft({ ...value, ...patch });
  const setLine = (id, patch) => change({ lines: { ...value.lines, [id]: { ...value.lines[id], ...patch } } });
  const videoSeconds = board.shots.reduce(
    (t, s) => t + Math.max(1, s.duration_seconds - (s.trim_start || 0) - (s.trim_end || 0)),
    0
  );
  const hasLines = Object.values(value.lines).some((l) => l.text.trim());
  const save = async () => {
    const lines = Object.entries(value.lines)
      .filter(([, l]) => l.text.trim())
      .map(([shot_id, l]) => ({ shot_id, text: l.text.trim(), offset: Number(l.offset) || 0 }));
    const ok = await onEdit('set_audio', {
      voice_id: value.voice_id,
      lines,
      music_prompt: value.music_prompt,
      instrumental: value.instrumental,
      ...(value.music_seconds ? { music_seconds: Number(value.music_seconds) } : {}),
    });
    if (ok) setDraft(null);
  };
  const voKeys = board.shots.filter((s) => s.vo_text && board.media[`vo:${s.id}`]).map((s) => `vo:${s.id}`);
  const voTodo = voKeys.filter((k) => {
    const m = board.media[k];
    return m?.status !== 'running' && (!m?.asset_id || m.stale);
  });
  return (
    <div className="space-y-5">
      {onChooseAudio && <AudioOptions board={board} onChooseAudio={onChooseAudio} busy={busy} />}
      <p className="rounded-xl border border-[#E8E9F0] bg-[#F8F8FC] px-4 py-3 text-[13px] leading-relaxed text-[#5E5E72]">
        Separate audio layered onto the video on Export (ElevenLabs). Each VO line is timed to its own shot, so it stays synced even when shots are reordered or trimmed. With VO enabled, clip audio and music automatically duck. Generating uses credits.
      </p>
      <div className="space-y-4 rounded-2xl border border-[#E8E9F0] bg-white p-5 shadow-[0_1px_2px_rgba(20,20,31,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[14.5px] font-semibold text-[#14141F]">Voiceover per shot</div>
          <select
            className={`${inputClass} w-auto min-w-[220px]`}
            value={value.voice_id}
            onChange={(e) => change({ voice_id: e.target.value })}
          >
            <option value="">Select a voice…</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.gender === 'female' ? 'female' : 'male'} · {v.description}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-3">
          {board.shots.map((shot, i) => {
            const line = value.lines[shot.id] || { text: '', offset: 0.3 };
            const media = board.media[`vo:${shot.id}`];
            const src = assetUrl(media?.asset_id, workspaceId);
            const read = Math.round((line.text.length / CHARS_PER_SECOND) * 10) / 10;
            const room = Math.max(
              0,
              shot.duration_seconds - (shot.trim_start || 0) - (shot.trim_end || 0) - (Number(line.offset) || 0)
            );
            return (
              <div key={shot.id} className="rounded-xl border border-[#ECECF4] bg-[#FAFAFD] p-3.5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                  <span className="truncate font-medium text-[#14141F]">
                    <span className="text-[#7A7B90]">Shot {i + 1} · </span>
                    {shot.title} <span className="text-[#7A7B90]">· {shot.duration_seconds}s</span>
                  </span>
                  {media && <Badge tone={mediaStatus(media).tone}>{mediaStatus(media).label}</Badge>}
                </div>
                <textarea
                  rows={2}
                  className={inputClass}
                  placeholder="Leave blank if this shot has no VO"
                  value={line.text}
                  onChange={(e) => setLine(shot.id, { text: e.target.value })}
                />
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-[#5E5E72]">
                  <label className="flex items-center gap-1.5">
                    <span>starts at</span>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      className={`${inputClass} w-20 py-1.5`}
                      value={line.offset}
                      onChange={(e) => setLine(shot.id, { offset: e.target.value })}
                    />
                    <span>sec</span>
                  </label>
                  {line.text && (
                    <span className={read > room ? 'font-medium text-[#A05C07]' : 'text-[#5E5E72]'}>
                      ~{read}s read · {Math.round(room * 10) / 10}s available
                      {read > room ? ' (too long, spills into next shot)' : ''}
                    </span>
                  )}
                </div>
                {src && <audio key={src} src={src} controls className="mt-2.5 h-9 w-full" />}
                {media?.error && <p className="mt-1.5 text-[12px] text-[#C01048]">{media.error}</p>}
              </div>
            );
          })}
        </div>
        {!draft && voTodo.length > 0 && (
          <SmallButton tone="accent" disabled={busy} onClick={() => onRequest(voTodo)}>
            Generate {voTodo.length} VO {voTodo.length === 1 ? 'line' : 'lines'}
          </SmallButton>
        )}
      </div>
      {audio.voiceover?.text && (
        <AudioTrack
          title="Narration (single track from start)"
          mediaKey="audio:voiceover"
          media={board.media['audio:voiceover']}
          workspaceId={workspaceId}
          onEdit={onEdit}
          onRequest={onRequest}
          busy={busy || !!draft}
          canGenerate
        >
          <p className="text-[13.5px] leading-relaxed text-[#3A3B4C]">{audio.voiceover.text}</p>
        </AudioTrack>
      )}
      <AudioTrack
        title="Music"
        mediaKey="audio:music"
        media={board.media['audio:music']}
        workspaceId={workspaceId}
        onEdit={onEdit}
        onRequest={onRequest}
        busy={busy || !!draft}
        canGenerate={!!audio.music?.prompt}
      >
        <textarea
          rows={3}
          className={inputClass}
          placeholder="Genre, mood, tempo, instruments… e.g. warm lo-fi, acoustic guitar, 85 bpm"
          value={value.music_prompt}
          onChange={(e) => change({ music_prompt: e.target.value })}
        />
        <div className="flex flex-wrap items-center gap-4 text-[12.5px] text-[#4C4D61]">
          <label className="flex items-center gap-2">
            <span>Duration</span>
            <input
              type="number"
              min={3}
              max={300}
              className={`${inputClass} w-24 py-1.5`}
              placeholder={String(videoSeconds || 30)}
              value={value.music_seconds}
              onChange={(e) => change({ music_seconds: e.target.value })}
            />
            <span>seconds</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded accent-[#5B45F2]"
              checked={value.instrumental}
              onChange={(e) => change({ instrumental: e.target.checked })}
            />
            <span>Instrumental (no vocals)</span>
          </label>
        </div>
      </AudioTrack>
      {draft && (
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <SmallButton tone="accent" disabled={busy || (hasLines && !value.voice_id)} onClick={save}>
            Save audio
          </SmallButton>
          <SmallButton onClick={() => setDraft(null)}>Cancel</SmallButton>
          {hasLines && !value.voice_id && <span className="text-[12.5px] font-medium text-[#A05C07]">Select a voice first.</span>}
        </div>
      )}
    </div>
  );
}
