'use client';

// Views of the Director's project board. Every item can be edited and locked
// directly; edits go through the same validation as the agent's tools.

import { useEffect, useRef, useState } from 'react';

export const fmtCredits = (value) => Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });

export function Badge({ children, tone = 'default' }) {
  const tones = {
    default: 'bg-white/[0.06] text-white/60',
    accent: 'bg-[#d4ff64]/10 text-[#e4f5bd]',
    amber: 'bg-amber-400/10 text-amber-300',
    green: 'bg-emerald-400/10 text-emerald-300',
    red: 'bg-red-400/10 text-red-300',
  };
  return <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium ${tones[tone]}`}>{children}</span>;
}

function Section({ title, children, action }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/40">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }) {
  return <p className="rounded-xl border border-dashed border-white/[0.08] px-4 py-6 text-center text-[12px] text-white/35">{children}</p>;
}

export const inputClass = 'w-full rounded-lg border border-white/10 bg-[#0b0e13] px-2.5 py-1.5 text-[12px] text-white outline-none focus:border-[#d4ff64]/40';

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wider text-white/35">{label}</span>
      {children}
    </label>
  );
}

export function SmallButton({ children, onClick, disabled, tone = 'default', title }) {
  const tones = {
    default: 'border-white/10 text-white/60 hover:border-white/25 hover:text-white',
    accent: 'border-[#d4ff64]/30 bg-[#d4ff64] text-[#10130a] font-semibold hover:bg-[#e0ff8c]',
  };
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled}
      className={`rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-40 ${tones[tone]}`}>
      {children}
    </button>
  );
}

export function LockButton({ locked, onToggle, disabled }) {
  return (
    <SmallButton onClick={onToggle} disabled={disabled} title={locked ? 'Terkunci: Director tidak akan mengubahnya. Klik untuk membuka.' : 'Kunci supaya Director tidak mengubahnya'}>
      <span className="inline-flex items-center gap-1">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d={locked ? 'M8 11V7a4 4 0 0 1 8 0v4' : 'M8 11V7a4 4 0 0 1 7.5-2'} />
        </svg>
        {locked ? 'Terkunci' : 'Kunci'}
      </span>
    </SmallButton>
  );
}

// ---------------------------------------------------------------- media

const MEDIA_STATUS = {
  none: { label: 'Belum dibuat', tone: 'default' },
  running: { label: 'Diproses', tone: 'amber' },
  succeeded: { label: 'Selesai', tone: 'green' },
  failed: { label: 'Gagal', tone: 'red' },
};

export function mediaStatus(media) {
  if (!media) return MEDIA_STATUS.none;
  if (media.stale) return { label: 'Perlu diulang', tone: 'amber' };
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
    <div className={`${aspect} relative flex items-center justify-center overflow-hidden bg-black/40`}>
      {full && media.kind === 'video' ? (
        <video src={full} controls preload="metadata" className="h-full w-full object-cover" />
      ) : full ? (
        <a href={full} target="_blank" rel="noreferrer" className="h-full w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetUrl(media.asset_id, workspaceId, true)} alt={label} className="h-full w-full object-cover" loading="lazy"
            onError={(event) => { if (!event.currentTarget.dataset.full) { event.currentTarget.dataset.full = '1'; event.currentTarget.src = full; } }} />
        </a>
      ) : (
        <span className={`text-[11px] ${busy ? 'animate-pulse text-amber-300/70' : 'text-white/25'}`}>
          {busy ? 'Sedang dibuat…' : media?.kind === 'video' ? 'Video' : 'Gambar'}
        </span>
      )}
      {media && (media.stale || media.status === 'failed') && (
        <span className="absolute left-2 top-2"><Badge tone={mediaStatus(media).tone}>{mediaStatus(media).label}</Badge></span>
      )}
    </div>
  );
}


// ---------------------------------------------------------------- brief

// brief.look: how the whole video is rendered (sheets, frames and clips follow it).
// Same keys and order as BRIEF_DETAILS in director_service/board.py.
export const BRIEF_DETAIL_LABELS = {
  goal: 'Tujuan', audience: 'Target penonton', platform: 'Platform', key_message: 'Pesan utama', product: 'Produk / brand',
  tone: 'Mood & tone', references: 'Referensi', cta: 'Penutup / CTA', must_have: 'Wajib ada', avoid: 'Hindari',
};

export const LOOK_LABELS = { realistic: 'Realistis', '3d_animation': 'Animasi 3D', anime: 'Anime', illustration: 'Ilustrasi', other: 'Lainnya' };

export function BriefView({ board, onEdit, busy }) {
  const brief = board.brief || {};
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(brief);
  useEffect(() => { if (!editing) setDraft(brief); }, [brief, editing]);

  const save = async () => {
    const ok = await onEdit('update_brief', {
      summary: draft.summary || '', ...Object.fromEntries(Object.keys(BRIEF_DETAIL_LABELS).map((k) => [k, draft[k] || ''])),
      ...(draft.look ? { look: draft.look } : {}), aspect_ratio: draft.aspect_ratio, style: draft.style || '', resolution: draft.resolution,
      generate_audio: !!draft.generate_audio, ...(draft.duration_seconds ? { duration_seconds: Number(draft.duration_seconds) } : {}),
    });
    if (ok) setEditing(false);
  };

  const actions = (
    <div className="flex gap-1.5">
      {!editing && <SmallButton onClick={() => setEditing(true)} disabled={busy}>Edit</SmallButton>}
      <LockButton locked={brief.locked} disabled={busy} onToggle={() => onEdit('set_lock', { target: 'brief', locked: !brief.locked })} />
    </div>
  );

  if (editing) {
    return (
      <Section title="Brief" action={actions}>
        <div className="space-y-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <Field label="Ringkasan"><textarea rows={4} className={inputClass} value={draft.summary || ''} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} /></Field>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {Object.entries(BRIEF_DETAIL_LABELS).map(([key, label]) => (
              <Field key={key} label={label}><textarea rows={2} className={inputClass} value={draft[key] || ''} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></Field>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Rasio">
              <select className={inputClass} value={draft.aspect_ratio} onChange={(e) => setDraft({ ...draft, aspect_ratio: e.target.value })}>
                {['16:9', '9:16', '1:1'].map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Durasi (detik)"><input type="number" min={4} max={600} className={inputClass} value={draft.duration_seconds || ''} onChange={(e) => setDraft({ ...draft, duration_seconds: e.target.value })} /></Field>
            <Field label="Resolusi">
              <select className={inputClass} value={draft.resolution} onChange={(e) => setDraft({ ...draft, resolution: e.target.value })}>
                {['480p', '720p', '1080p'].map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Audio bawaan">
              <select className={inputClass} value={draft.generate_audio ? '1' : '0'} onChange={(e) => setDraft({ ...draft, generate_audio: e.target.value === '1' })}>
                <option value="0">Tanpa audio</option><option value="1">Dengan audio</option>
              </select>
            </Field>
          </div>
          <Field label="Tampilan">
            <select className={inputClass} value={draft.look || ''} onChange={(e) => setDraft({ ...draft, look: e.target.value })}>
              {!draft.look && <option value="">Belum dipilih</option>}
              {Object.entries(LOOK_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </Field>
          {draft.look && draft.look !== brief.look && brief.look && (
            <p className="text-[11px] text-amber-200/70">Mengganti tampilan membuat semua reference sheet dibuat ulang otomatis (memakai kredit), dan frame/video perlu di-generate ulang.</p>
          )}
          <Field label="Gaya visual"><input className={inputClass} value={draft.style || ''} onChange={(e) => setDraft({ ...draft, style: e.target.value })} /></Field>
          <div className="flex gap-2"><SmallButton tone="accent" onClick={save} disabled={busy}>Simpan</SmallButton><SmallButton onClick={() => setEditing(false)}>Batal</SmallButton></div>
        </div>
      </Section>
    );
  }
  if (!brief.summary) {
    return <Section title="Brief" action={actions}><Empty>Brief belum ada. Ceritakan ke Director video yang mau kamu buat.</Empty></Section>;
  }
  return (
    <div>
      <Section title="Brief" action={actions}>
        <p className="whitespace-pre-line text-sm leading-relaxed text-white/80">{brief.summary}</p>
        {Object.keys(BRIEF_DETAIL_LABELS).some((k) => brief[k]) && (
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
            {Object.entries(BRIEF_DETAIL_LABELS).filter(([k]) => brief[k]).map(([key, label]) => (
              <div key={key}>
                <dt className="text-[11px] uppercase tracking-wide text-white/35">{label}</dt>
                <dd className="mt-0.5 whitespace-pre-line text-[13px] leading-relaxed text-white/75">{brief[key]}</dd>
              </div>
            ))}
          </dl>
        )}
      </Section>
      <Section title="Format">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={brief.look ? 'default' : 'amber'}>{brief.look ? LOOK_LABELS[brief.look] || brief.look : 'Tampilan belum dipilih'}</Badge>
          <Badge>{brief.aspect_ratio}</Badge>
          {brief.duration_seconds && <Badge>{brief.duration_seconds} detik</Badge>}
          <Badge>{brief.resolution}</Badge>
          <Badge>{brief.generate_audio ? 'dengan audio' : 'tanpa audio'}</Badge>
        </div>
        {brief.style && <p className="mt-3 text-[13px] text-white/60"><span className="text-white/35">Gaya visual: </span>{brief.style}</p>}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- concepts

export function ConceptsView({ board, onEdit, onChooseConcept, busy }) {
  const concepts = board.concepts || { options: [] };
  if (!concepts.options?.length) return <Empty>Belum ada konsep. Minta Director menawarkan beberapa arah kreatif.</Empty>;
  const canChoose = !busy && !concepts.locked;
  return (
    <Section title="Arah kreatif" action={<LockButton locked={concepts.locked} disabled={busy} onToggle={() => onEdit('set_lock', { target: 'concepts', locked: !concepts.locked })} />}>
      <p className="mb-3 text-[12px] text-white/45">Klik konsep untuk memilihnya. Director langsung melanjutkan dengan konsep itu.</p>
      <div className="space-y-3">
        {concepts.options.map((option) => {
          const chosen = concepts.chosen === option.id;
          const clickable = canChoose && !chosen;
          return (
            <button key={option.id} type="button" disabled={!clickable} onClick={() => onChooseConcept(option)}
              className={`block w-full rounded-xl border p-4 text-left transition-colors ${
                chosen ? 'border-[#d4ff64]/40 bg-[#d4ff64]/[0.05]'
                  : clickable ? 'border-white/[0.07] bg-white/[0.02] hover:border-[#d4ff64]/30 hover:bg-white/[0.04]'
                    : 'cursor-default border-white/[0.07] bg-white/[0.02]'
              }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="text-[14px] font-semibold text-white">{option.title}</div>
                <div className="flex flex-none items-center gap-1.5">
                  {concepts.recommended === option.id && <Badge tone="accent">Rekomendasi</Badge>}
                  {chosen && <Badge tone="green">Dipilih</Badge>}
                </div>
              </div>
              <p className="mt-1.5 text-[13px] text-white/75">{option.logline}</p>
              {option.approach && <p className="mt-2 text-[12px] text-white/50"><span className="text-white/30">Pendekatan: </span>{option.approach}</p>}
              {option.why && <p className="mt-1 text-[12px] text-white/50"><span className="text-white/30">Kenapa: </span>{option.why}</p>}
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
        if (!res.ok || !data.id) throw new Error(data.error || 'Upload gagal');
        ids.push(data.id);
      }
      await onEdit('set_element_photos', { id: item.id, photos: [...photos, ...ids] });
    } catch (err) {
      setError(err.message || 'Upload gagal');
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {photos.map((id) => (
          <div key={id} className="group relative h-11 w-11 overflow-hidden rounded-md border border-white/15">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assetUrl(id, workspaceId, true)} alt="Foto referensi" className="h-full w-full object-cover" />
            <button type="button" disabled={busy || uploading} aria-label="Hapus foto"
              onClick={() => onEdit('set_element_photos', { id: item.id, photos: photos.filter((p) => p !== id) })}
              className="absolute right-0 top-0 hidden h-4 w-4 items-center justify-center rounded-bl bg-black/80 text-[10px] text-white group-hover:flex">×</button>
          </div>
        ))}
        {photos.length < MAX_ELEMENT_PHOTOS && (
          <SmallButton disabled={busy || uploading || item.locked} onClick={() => input.current?.click()}>
            {uploading ? 'Mengupload…' : photos.length ? '+ Foto' : '+ Foto asli'}
          </SmallButton>
        )}
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
      {photos.length > 0 && <p className="mt-1 text-[10px] text-white/35">Sheet dibuat dari foto ini (generate ulang otomatis, pakai kredit).</p>}
      {error && <p className="mt-1 text-[10px] text-red-300/80">{error}</p>}
    </div>
  );
}

function ElementCard({ item, board, onEdit, onRequest, busy, workspaceId }) {
  const media = board.media[`element:${item.id}`];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item);
  useEffect(() => { if (!editing) setDraft(item); }, [item, editing]);
  const save = async () => {
    if (await onEdit('upsert_element', { id: item.id, kind: item.kind, name: draft.name, description: draft.description })) setEditing(false);
  };
  const generated = media?.asset_id && !media.stale;
  return (
    <div className={`overflow-hidden rounded-xl border bg-white/[0.02] ${item.locked ? 'border-emerald-400/20' : 'border-white/[0.07]'}`}>
      <MediaFrame media={media} workspaceId={workspaceId} label={`${item.name} reference sheet`} aspect="aspect-video" />
      <div className="p-3">
        {editing ? (
          <div className="space-y-2">
            <input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <textarea rows={5} className={inputClass} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <div className="flex gap-2"><SmallButton tone="accent" onClick={save} disabled={busy}>Simpan</SmallButton><SmallButton onClick={() => setEditing(false)}>Batal</SmallButton></div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-[13px] font-medium text-white/90">{item.name}</div>
              <span className="text-[10px] text-white/35">{mediaStatus(media).label}</span>
            </div>
            <p className="mt-1 line-clamp-4 text-[11px] leading-snug text-white/45" title={item.description}>{item.description}</p>
            <ElementPhotos item={item} onEdit={onEdit} busy={busy} workspaceId={workspaceId} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              <SmallButton onClick={() => onRequest([`element:${item.id}`], !!generated)} disabled={busy}>
                {media?.asset_id ? 'Generate ulang sheet' : 'Generate sheet'}
              </SmallButton>
              <SmallButton onClick={() => setEditing(true)} disabled={busy}>Edit</SmallButton>
              <LockButton locked={item.locked} disabled={busy} onToggle={() => onEdit('set_lock', { target: `element:${item.id}`, locked: !item.locked })} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function AssetsView({ board, onEdit, onRequest, busy, workspaceId }) {
  if (!board.elements.length) return <Empty>Belum ada karakter, lokasi, atau properti untuk cerita ini.</Empty>;
  const missing = board.elements.filter((e) => { const m = board.media[`element:${e.id}`]; return !m?.asset_id || m.stale; });
  const groups = [['character', 'Karakter'], ['location', 'Lokasi'], ['prop', 'Properti']];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-white/50">Setiap aset dibuat sebagai satu reference sheet supaya tampilannya konsisten di semua shot.</p>
        {missing.length > 0 && (
          <SmallButton tone="accent" disabled={busy} onClick={() => onRequest(missing.map((e) => `element:${e.id}`))}>
            Generate {missing.length} sheet
          </SmallButton>
        )}
      </div>
      {groups.map(([kind, label]) => {
        const items = board.elements.filter((e) => e.kind === kind);
        if (!items.length) return null;
        return (
          <Section key={kind} title={`${label} (${items.length})`}>
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((item) => <ElementCard key={item.id} item={item} board={board} onEdit={onEdit} onRequest={onRequest} busy={busy} workspaceId={workspaceId} />)}
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
  useEffect(() => { if (!dirty) setDraft(script || { title: '', text: '' }); }, [script, dirty]);
  const save = async () => { if (await onEdit('write_script', { title: draft.title, text: draft.text })) setDirty(false); };
  const change = (patch) => { setDraft({ ...draft, ...patch }); setDirty(true); };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input className={`${inputClass} text-[14px] font-semibold`} placeholder="Judul" value={draft.title} onChange={(e) => change({ title: e.target.value })} />
        {script && <LockButton locked={script.locked} disabled={busy} onToggle={() => onEdit('set_lock', { target: 'script', locked: !script.locked })} />}
      </div>
      <textarea rows={24} className={`${inputClass} text-[13px] leading-relaxed`} placeholder="Naskah belum ditulis. Minta Director menulisnya, atau tulis sendiri di sini."
        value={draft.text} onChange={(e) => change({ text: e.target.value })} />
      <div className="flex flex-wrap items-center gap-2">
        {dirty && (
          <>
            <SmallButton onClick={save} disabled={busy || !draft.text.trim()}>Simpan naskah</SmallButton>
            <SmallButton onClick={() => setDirty(false)}>Buang perubahan</SmallButton>
          </>
        )}
        {(script || dirty) && draft.text.trim() && (
          script?.locked && !dirty
            ? <Badge tone="green">Naskah sudah dikonfirmasi</Badge>
            : <SmallButton tone="accent" disabled={busy} onClick={() => onConfirmScript({ title: draft.title, text: draft.text }, dirty, () => setDirty(false))}>Konfirmasi naskah</SmallButton>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- research

export function ResearchView({ board }) {
  if (!board.research.length) return <Empty>Belum ada riset. Minta Director riset kalau perlu referensi.</Empty>;
  return (
    <div className="space-y-3">
      {[...board.research].reverse().map((item) => (
        <div key={item.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="text-[13px] font-medium text-white/90">{item.query}</div>
          <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-white/70">{item.notes}</p>
          {item.sources.length > 0 && (
            <ul className="mt-3 space-y-1">
              {item.sources.map((url) => {
                let host = url;
                try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep raw */ }
                return (
                  <li key={url} className="text-[11px]">
                    <a href={url} target="_blank" rel="noreferrer noopener" className="text-[#d4ff64]/75 hover:text-[#d4ff64] hover:underline">{host}</a>
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
    loadVersions().then((list) => { if (!cancelled) setVersions(list); }).catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [loadVersions, board.version]);
  if (error) return <p className="text-[12px] text-red-300">{error}</p>;
  if (!versions) return <p className="text-[12px] text-white/40">Memuat riwayat…</p>;
  const authors = { agent: 'Director', user: 'Kamu', system: 'Sistem' };
  return (
    <Section title={`Riwayat · versi sekarang v${board.version}`}>
      <ul className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.07]">
        {versions.map((v) => (
          <li key={v.version} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-[12px] text-white/80">
                <span className="mr-2 tabular-nums text-white/35">v{v.version}</span>{v.summary}
              </div>
              <div className="text-[10px] text-white/35">{authors[v.author] || v.author} · {new Date(v.created_at).toLocaleString('id-ID')}</div>
            </div>
            {v.version === board.version ? <Badge tone="accent">Sekarang</Badge> : (
              <SmallButton disabled={busy} onClick={() => onRestore(v.version)}>Pulihkan</SmallButton>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-white/35">Memulihkan versi lama membuat versi baru, jadi tidak ada yang hilang. Gambar/video yang tidak cocok lagi ditandai “Perlu diulang”.</p>
    </Section>
  );
}
