'use client';

// The Director conversation: plain-text answers, user bubbles, collapsible
// "what I did" step groups, and artifact / generation cards.

import { Fragment, useEffect, useState } from 'react';
import { Badge, assetUrl, fmtCredits } from './BoardViews.js';
import { groupShots } from './Workspace.js';

export function Spinner() {
  return <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-[#d4ff64]" aria-hidden="true" />;
}

const ACCENT = 'text-[#d4ff64]';

// ---------------------------------------------------------------- tiny markdown (answers only)

// **bold**, *italic* / _italic_ (titles); everything else is plain text.
const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*?\*|(?<![\w])_[^_\s][^_\n]*?_(?![\w]))/g;

function inline(text) {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    if ((part.startsWith('*') && part.endsWith('*') && part.length > 2) || (part.startsWith('_') && part.endsWith('_') && part.length > 2)) {
      return <em key={i} className="italic">{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function Markdown({ text }) {
  const blocks = [];
  let list = null;
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol';
      if (!list || list.type !== type) { list = { type, items: [] }; blocks.push(list); }
      list.items.push(bullet ? bullet[1] : numbered[2]);
      continue;
    }
    list = null;
    if (!line.trim()) { blocks.push({ type: 'gap' }); continue; }
    const last = blocks[blocks.length - 1];
    if (last?.type === 'p') last.lines.push(line); else blocks.push({ type: 'p', lines: [line] });
  }
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        if (block.type === 'gap') return null;
        if (block.type === 'p') return <p key={i}>{block.lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>;
        const List = block.type;
        return (
          <List key={i} className={`space-y-1 pl-5 ${block.type === 'ul' ? 'list-disc' : 'list-decimal'} marker:text-white/40`}>
            {block.items.map((item, j) => <li key={j}>{inline(item)}</li>)}
          </List>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- step groups (reasoning)

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="flex-none text-white/50">
    <circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" />
  </svg>
);

function stepText(text) {
  return text.startsWith('Membaca skill: ') ? `Membaca panduan ${text.slice('Membaca skill: '.length)}` : text;
}

function groupLabel(items) {
  const work = items.filter((e) => !e.text.startsWith('Membaca skill: '));
  if (!work.length) return items.length > 1 ? 'Membaca panduan kreatif' : stepText(items[0].text);
  const label = work[work.length - 1].text;
  return work.length > 1 ? `${label} · ${work.length} langkah` : label;
}

function StepGroup({ items, live }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex max-w-full items-center gap-1.5 text-left text-[10.5px] text-white/40 hover:text-white/65">
        {live && <Spinner />}
        <span className="truncate">{groupLabel(items)}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`flex-none transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
      </button>
      {open && (
        <div className="mt-2 space-y-2.5 rounded-2xl border border-white/[0.08] bg-[#111418] px-3.5 py-3">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2.5 text-[11px] text-white/70"><CheckIcon /><span>{stepText(item.text)}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- cards

function CardShell({ icon, title, accent, children, action, onAction, actionDisabled, secondary }) {
  return (
    <div className="w-full max-w-[380px]">
      <div className="rounded-[18px] border border-white/[0.09] bg-gradient-to-b from-[#1c1f25] to-[#121418] p-1.5 shadow-[0_10px_30px_#0006]">
        <div className="flex min-w-0 items-center gap-2 px-2.5 pb-2 pt-1.5">
          <span className="grid h-6 w-6 flex-none place-items-center rounded-md bg-[#d4ff64]/15 text-[12px] text-[#d4ff64]">{icon}</span>
          <span className="truncate text-[13px] font-semibold text-white">
            {title}{accent && <span className={ACCENT}> — {accent}</span>}
          </span>
        </div>
        <div className="rounded-[14px] border border-white/[0.06] bg-gradient-to-b from-[#2a2e35] via-[#1d2026] to-[#17191d] p-3">{children}</div>
      </div>
      {(action || secondary) && (
        <div className="mt-2 flex gap-2">
          {action && (
            <button type="button" onClick={onAction} disabled={actionDisabled}
              className="flex-1 rounded-full border border-white/[0.1] bg-gradient-to-b from-[#2b2e34] to-[#1b1d21] py-2 text-[12px] font-semibold text-white/90 hover:border-white/25 disabled:opacity-50">
              {action}
            </button>
          )}
          {secondary}
        </div>
      )}
    </div>
  );
}

/** Up to three overlapping thumbnails; items without an image yet show their name. */
function Stack({ items }) {
  const withImage = items.filter((i) => i.src);
  const tiles = [...withImage, ...items.filter((i) => !i.src)].slice(0, 3);
  const rot = ['-rotate-6', 'rotate-0', 'rotate-6'];
  const pos = ['left-0', 'left-7', 'left-14'];
  return (
    <div className="relative h-[72px] w-[124px] flex-none">
      {(tiles.length ? tiles : [{ src: null, label: '—' }]).map((tile, i) => (
        <div key={i} className={`absolute top-1 h-[64px] w-[64px] overflow-hidden rounded-lg border border-white/20 bg-[#0d0f12] shadow-lg ${rot[i]} ${pos[i]}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {tile.src ? <img src={tile.src} alt={tile.label} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center px-1 text-center text-[9px] leading-tight text-white/35">{tile.label}</div>}
        </div>
      ))}
    </div>
  );
}

const CARD_NAMES = { brief: 'Brief', concepts: 'Arah kreatif', research: 'Riset', script: 'Naskah', assets: 'Aset', shots: 'Shot list', audio: 'Audio' };

/** An older copy of a card (a newer one is further down) or a closed request: one quiet line, no repeat. */
function FoldedLine({ text, onOpen }) {
  return (
    <button type="button" onClick={onOpen} disabled={!onOpen}
      className="flex items-center gap-1.5 text-[10.5px] text-white/35 hover:text-white/70 disabled:hover:text-white/35">
      <span className="text-[#d4ff64]/50">↺</span>{text}
    </button>
  );
}

function ArtifactCard({ card, board, workspaceId, onOpen, busy }) {
  if (card === 'script') {
    if (!board.script) return null;
    return (
      <CardShell icon="✎" title="Naskah" accent={board.script.title} action="Buka naskah" onAction={() => onOpen('script')}>
        <p className="line-clamp-4 whitespace-pre-line text-[12px] leading-relaxed text-white/60">{board.script.text}</p>
      </CardShell>
    );
  }
  if (card === 'brief') {
    const brief = board.brief || {};
    return (
      <CardShell icon="◎" title="Brief" accent={brief.duration_seconds ? `${brief.duration_seconds} detik · ${brief.aspect_ratio}` : brief.aspect_ratio} action="View" onAction={() => onOpen('brief')}>
        <p className="line-clamp-3 text-[12px] leading-relaxed text-white/65">{brief.summary}</p>
        {[brief.goal, brief.audience, brief.product].some(Boolean) && <p className="mt-1.5 line-clamp-2 text-[11px] text-white/45">{[brief.goal, brief.audience, brief.product].filter(Boolean).join(' · ')}</p>}
        {brief.style && <p className="mt-1.5 line-clamp-1 text-[11px] text-white/40">{brief.style}</p>}
      </CardShell>
    );
  }
  if (card === 'assets') {
    const kinds = [['character', 'Karakter'], ['location', 'Lokasi'], ['prop', 'Properti']];
    return (
      <CardShell icon="☺" title="Aset" accent="siap dicek" action="View" onAction={() => onOpen('assets')}>
        <div className="flex items-center gap-4">
          <Stack items={board.elements.map((e) => ({ src: assetUrl(board.media[`element:${e.id}`]?.asset_id, workspaceId, true), label: e.name }))} />
          <div className="min-w-0 space-y-1 text-[12px] font-semibold text-white/85">
            {kinds.map(([kind, label]) => {
              const items = board.elements.filter((e) => e.kind === kind);
              if (!items.length) return null;
              return <p key={kind} className="truncate">{label}{items.length === 1 ? ` — ${items[0].name}` : ''} × {items.length}</p>;
            })}
          </div>
        </div>
      </CardShell>
    );
  }
  if (card === 'shots') {
    const { numbered } = groupShots(board);
    const total = numbered.reduce((t, n) => t + n.shot.duration_seconds, 0);
    return (
      <CardShell icon="▤" title={numbered.length ? 'Shot list' : 'Scene list'} accent={numbered.length ? `${total} detik` : 'shot belum dibuat'}
        action="View" onAction={() => onOpen(null)}>
        <div className="flex items-center gap-4">
          <Stack items={numbered.map((n) => ({ src: assetUrl(board.media[`frame:${n.shot.id}`]?.asset_id, workspaceId, true), label: n.shot.title }))} />
          <div className="min-w-0 space-y-1 text-[12px] font-semibold text-white/85">
            {board.scenes?.length > 0 && <p>Scene × {board.scenes.length}</p>}
            {numbered.length > 0 && <p>Shot × {numbered.length}</p>}
          </div>
        </div>
      </CardShell>
    );
  }
  if (card === 'concepts') {
    const concepts = board.concepts || { options: [] };
    return (
      <CardShell icon="✦" title="Arah kreatif" accent={`${concepts.options.length} konsep`} action={concepts.chosen ? 'View' : 'Pilih konsep'} onAction={() => onOpen('concepts')}>
        <ul className="space-y-1">
          {concepts.options.map((o) => (
            <li key={o.id} className="truncate text-[12px] text-white/75">
              {o.title}
              {concepts.recommended === o.id && <span className="ml-1.5 text-[11px] text-[#d4ff64]/80">rekomendasi</span>}
              {concepts.chosen === o.id && <span className="ml-1.5 text-[11px] text-emerald-300/90">dipilih</span>}
            </li>
          ))}
        </ul>
      </CardShell>
    );
  }
  if (card === 'audio') {
    const audio = board.audio || {};
    const chosen = audio.options?.find((o) => o.id === audio.chosen);
    const voLines = board.shots.filter((s) => s.vo_text).length;
    const lines = [
      voLines ? `VO (${audio.voiceover?.voice_name || 'suara'}): ${voLines} baris di ${voLines} shot` : audio.voiceover?.text && `VO (${audio.voiceover.voice_name || 'suara'}): ${audio.voiceover.text}`,
      audio.music?.prompt && `Musik: ${audio.music.prompt}`,
    ].filter(Boolean);
    const options = audio.options?.length && !audio.chosen;
    const accent = audio.chosen === 'none' ? 'tanpa audio' : chosen ? chosen.title : options ? `${audio.options.length} usulan` : null;
    return (
      <CardShell icon="♪" title="Audio" accent={accent} action={options ? 'Lihat & pilih' : 'View'} onAction={() => onOpen('audio')}>
        {options ? (
          <ul className="space-y-1">
            {audio.options.map((o) => (
              <li key={o.id} className="truncate text-[12px] text-white/75">
                {o.title}{audio.recommended === o.id && <span className="ml-1.5 text-[11px] text-[#d4ff64]/80">rekomendasi</span>}
              </li>
            ))}
          </ul>
        ) : lines.length ? lines.map((line) => <p key={line} className="line-clamp-2 text-[12px] leading-relaxed text-white/65">{line}</p>)
          : <p className="text-[12px] text-white/45">Tanpa voiceover dan musik.</p>}
      </CardShell>
    );
  }
  if (card === 'research') {
    const latest = board.research[board.research.length - 1];
    if (!latest) return null;
    return (
      <CardShell icon="⌕" title="Riset" accent={latest.query} action="View" onAction={() => onOpen('research')}>
        <p className="line-clamp-3 text-[12px] leading-relaxed text-white/60">{latest.notes}</p>
      </CardShell>
    );
  }
  return null;
}

export function requestSummary(estimate) {
  const parts = [];
  if (estimate.images) parts.push(`${estimate.images} gambar`);
  if (estimate.videos) parts.push(estimate.video_seconds ? `${estimate.videos} video (${estimate.video_seconds} detik)` : `${estimate.videos} video`);
  if (estimate.audio) parts.push(`${estimate.audio} audio`);
  return parts.join(' + ');
}

const REQUEST_STATUS = {
  pending: { label: 'Menunggu persetujuan', tone: 'accent' },
  running: { label: 'Sedang dibuat', tone: 'amber' },
  done: { label: 'Selesai', tone: 'green' },
  failed: { label: 'Sebagian gagal', tone: 'red' },
  rejected: { label: 'Dibatalkan', tone: 'default' },
  superseded: { label: 'Diganti estimasi baru', tone: 'default' },
  needs_credits: { label: 'Kredit kurang', tone: 'amber' },
};

// Voiceover lines and music are never needed to make the video: on a pending card they start unticked.
const isOptional = (key) => key.startsWith('vo:') || key.startsWith('audio:');

function RequestCard({ request, board, workspaceId, busy, generationRunning, onApprove, onReject }) {
  // Optional when it comes with frames or videos; a card of audio alone was asked for on purpose, so it starts ticked.
  const [ticked, setTicked] = useState(() => (request?.items?.length && request.items.every(isOptional) ? request.items : []));
  if (!request) return null;
  const auto = !!request.auto;
  const status = auto && request.status === 'pending' ? { label: 'Antre', tone: 'amber' } : (REQUEST_STATUS[request.status] || REQUEST_STATUS.pending);
  const pending = request.status === 'pending' && !auto;
  const optional = pending ? request.items.filter(isOptional) : [];
  const skip = optional.filter((k) => !ticked.includes(k));
  const required = request.items.filter((k) => !skip.includes(k));
  const base = request.estimate || {};
  const left = skip.reduce((sum, k) => sum + Number(request.item_estimates?.[k]?.credits || 0), 0);
  const estimate = skip.length ? { ...base, audio: Math.max(0, (base.audio || 0) - skip.length), credits: Math.max(0, (base.credits || 0) - left) } : base;
  const nothing = pending && required.length === 0;
  return (
    <CardShell icon="✧" title={`Generate ${requestSummary(estimate) || 'audio'}`} accent={auto ? 'otomatis' : null}
      action={pending ? 'Approve & generate' : null} onAction={() => onApprove(skip, estimate)}
      actionDisabled={busy || generationRunning || !base.available || nothing}
      secondary={pending ? (
        <button type="button" onClick={onReject} disabled={busy}
          className="rounded-full border border-white/[0.1] px-4 py-2 text-[12px] text-white/60 hover:border-white/25 disabled:opacity-50">Batal</button>
      ) : null}>
      <div className="flex items-start gap-4">
        <Stack items={required.map((k) => ({ src: board.media[k]?.kind === 'audio' ? null : assetUrl(board.media[k]?.asset_id, workspaceId, true), label: (board.media[k]?.label || k).replace(' — reference sheet', '') }))} />
        <div className="min-w-0 flex-1">
          <div className="mb-1.5"><Badge tone={status.tone}>{status.label}</Badge></div>
          <ul className="space-y-0.5">
            {required.filter((k) => !optional.includes(k)).slice(0, 4).map((key) => <li key={key} className="truncate text-[11px] text-white/55">{board.media[key]?.label || key}</li>)}
            {required.length - optional.filter((k) => ticked.includes(k)).length > 4 && <li className="text-[10px] text-white/35">+{required.length - optional.filter((k) => ticked.includes(k)).length - 4} lagi</li>}
          </ul>
          {optional.length > 0 && (
            <div className="mt-2 border-t border-white/[0.06] pt-1.5">
              <p className="text-[10px] text-white/35">Opsional, centang kalau mau ikut dibuat:</p>
              {optional.map((key) => (
                <label key={key} className="flex cursor-pointer items-center gap-1.5 truncate text-[11px] text-white/55">
                  <input type="checkbox" className="accent-[#d4ff64]" checked={ticked.includes(key)} disabled={busy}
                    onChange={(e) => setTicked(e.target.checked ? [...ticked, key] : ticked.filter((k) => k !== key))} />
                  <span className="truncate">{board.media[key]?.label || key}</span>
                  {request.item_estimates?.[key] && <span className="flex-none text-[10px] text-white/30">{fmtCredits(request.item_estimates[key].credits)} kr</span>}
                </label>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-[12px] text-white/75">
            {estimate.available ? <>{auto ? 'Biaya' : 'Estimasi'} <strong className={ACCENT}>{fmtCredits(estimate.credits)} kredit</strong></> : <span className="text-amber-300/80">Estimasi kredit belum tersedia.</span>}
          </p>
        </div>
      </div>
      {pending && generationRunning && <p className="mt-2 text-[10px] text-white/40">Tunggu generate yang sedang berjalan selesai dulu.</p>}
    </CardShell>
  );
}

// ---------------------------------------------------------------- final render

function fmtDuration(seconds) {
  const s = Math.round(Number(seconds) || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function RenderCard({ render, workspaceId, rendering, onRender }) {
  if (!render) return null;
  const done = render.status === 'done';
  const failed = render.status === 'failed';
  const progress = render.progress || { done: 0, total: render.shots?.length || 0 };
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const src = done && render.asset_id ? assetUrl(render.asset_id, workspaceId) : null;
  const notes = [];
  if (render.stills) notes.push(`${render.stills} shot masih frame diam`);
  if (render.skipped) notes.push(`${render.skipped} shot dilewati (belum ada gambar)`);
  return (
    <CardShell icon="▶" title="Video final" accent={done ? fmtDuration(render.duration_seconds) : failed ? 'gagal' : 'dirender'}
      action={done || failed ? (failed ? 'Coba render lagi' : 'Render ulang') : null} onAction={onRender} actionDisabled={rendering}
      secondary={done && src ? (
        <a href={`${src}&download=1`} download
          className="flex items-center justify-center rounded-full bg-[#d4ff64] px-5 py-2 text-[12px] font-semibold text-[#10130a] hover:brightness-110">
          Download
        </a>
      ) : null}>
      {done && src ? (
        <video src={src} controls preload="metadata" playsInline className="w-full rounded-lg bg-black" />
      ) : done ? (
        <p className="text-[11.5px] leading-relaxed text-white/50">File render lama ini sudah dihapus untuk menghemat penyimpanan (yang disimpan 3 render terakhir). Render ulang kalau masih butuh.</p>
      ) : failed ? (
        <p className="text-[11.5px] leading-relaxed text-red-300/90">{render.error || 'Render gagal.'}</p>
      ) : (
        <div>
          <div className="flex items-center gap-2 text-[11.5px] text-white/75">
            <Spinner /> {progress.done < progress.total ? `Menggabungkan shot ${Math.min(progress.done + 1, progress.total)}/${progress.total}` : 'Menyimpan video…'}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
            <div className="h-full rounded-full bg-[#d4ff64] transition-all" style={{ width: `${Math.max(4, pct)}%` }} />
          </div>
        </div>
      )}
      <p className="mt-2 text-[10.5px] text-white/40">
        {render.shots?.length || 0} shot · {render.aspect_ratio} · {render.resolution}{render.fps ? ` · ${render.fps} fps` : ''}{render.format ? ` · ${render.format.toUpperCase()}` : ''}
        {done && render.size_bytes ? ` · ${(render.size_bytes / (1024 * 1024)).toFixed(1)} MB` : ''}
        {notes.length ? ` · ${notes.join(', ')}` : ''}
      </p>
    </CardShell>
  );
}

// ---------------------------------------------------------------- timeline

function groupEntries(chat) {
  const blocks = [];
  for (const entry of chat) {
    if (entry.kind === 'activity') {
      const last = blocks[blocks.length - 1];
      if (last?.type === 'steps') last.items.push(entry);
      else blocks.push({ type: 'steps', items: [entry], key: `s-${entry.id}` });
    } else {
      blocks.push({ type: 'entry', entry, key: `e-${entry.id}` });
    }
  }
  return blocks;
}

// A held request: the balance cannot pay for it. Top up, then "Lanjutkan" approves it again.
function CreditGateCard({ entry, board, busy, onContinue }) {
  const request = board.requests.find((r) => r.id === entry.meta?.request_id);
  if (!request) return null;
  const gate = request.credit_gate || entry.meta || {};
  const held = request.status === 'needs_credits';
  return (
    <CardShell icon="!" title="Kredit kurang" accent={held ? 'tertahan' : 'lanjut'}
      action={held ? 'Lanjutkan' : null} onAction={() => onContinue(request)} actionDisabled={busy}
      secondary={held ? (
        <a href="/studio/billing" target="_blank" rel="noreferrer"
          className="rounded-full border border-[#d4ff64]/40 px-4 py-2 text-[12px] text-[#e4f5bd] hover:border-[#d4ff64]">Top up</a>
      ) : null}>
      <p className="text-[12px] text-white/75">
        Langkah ini butuh <strong className={ACCENT}>{fmtCredits(gate.needed)} kredit</strong>, saldo kamu {fmtCredits(gate.balance)}.
      </p>
      <p className="mt-1 text-[11px] text-white/45">{held ? 'Pekerjaanmu aman. Top up dulu, lalu klik Lanjutkan.' : 'Sudah dilanjutkan.'}</p>
    </CardShell>
  );
}

// The text cut into plain parts and @mention labels (earliest match first).
function splitMentions(text, labels) {
  const parts = [];
  let rest = text;
  while (rest) {
    let at = -1;
    let hit = null;
    for (const label of labels) {
      const i = rest.indexOf(label);
      if (i >= 0 && (at < 0 || i < at)) { at = i; hit = label; }
    }
    if (hit === null) { parts.push(rest); break; }
    if (at > 0) parts.push(rest.slice(0, at));
    parts.push(hit);
    rest = rest.slice(at + hit.length);
  }
  return parts;
}

// Images / videos attached to a user message, and its @mentions.
function UserMessage({ entry, workspaceId, videoNotes }) {
  const attachments = entry.meta?.attachments || [];
  const watched = attachments.filter((a) => a.kind === 'video' && videoNotes?.[a.asset_id]);
  const labels = (entry.meta?.mentions || []).map((m) => `@${m.label}`);
  return (
    <div className="flex flex-col items-end gap-1.5">
      {attachments.length > 0 && (
        <div className="flex max-w-[72%] flex-wrap justify-end gap-1.5">
          {attachments.map((a) => (
            <a key={a.asset_id} href={assetUrl(a.asset_id, workspaceId)} target="_blank" rel="noreferrer" title={a.name}
              className="relative h-16 w-16 overflow-hidden rounded-lg border border-white/10 bg-black/40">
              {a.kind === 'video'
                ? <video src={`${assetUrl(a.asset_id, workspaceId)}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={assetUrl(a.asset_id, workspaceId, true)} alt={a.name} className="h-full w-full object-cover" />}
              {a.kind === 'video' && <span className="absolute bottom-0 left-0 rounded-tr bg-black/70 px-1 text-[9px] text-white">▶</span>}
            </a>
          ))}
        </div>
      )}
      {watched.map((a) => (
        <details key={a.asset_id} className="max-w-[72%] rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[11px] text-white/60">
          <summary className="cursor-pointer text-white/45 hover:text-white/75">Hasil tonton AI · {a.name || 'video'}</summary>
          <p className="mt-1.5 whitespace-pre-line leading-relaxed">{videoNotes[a.asset_id]}</p>
        </details>
      ))}
      <div className="max-w-[72%] whitespace-pre-line break-words rounded-lg border border-white/[0.06] bg-[#181b20] px-3 py-1.5 text-[11.5px] leading-[1.6] text-white/90">
        {splitMentions(entry.text, labels).map((part, i) => (labels.includes(part)
          ? <span key={i} className="rounded bg-[#d4ff64]/15 px-1 text-[#e4f5bd]">{part}</span>
          : <Fragment key={i}>{part}</Fragment>))}
      </div>
    </div>
  );
}

function Entry({ entry, board, workspaceId, busy, generationRunning, renderRunning, onApprove, onReject, onOpenPanel, onRender, onContinue, folded }) {
  if (entry.kind === 'credit_gate') return <CreditGateCard entry={entry} board={board} busy={busy} onContinue={onContinue} />;
  if (entry.kind === 'render') {
    const render = (board.renders || []).find((r) => r.id === entry.meta?.render_id);
    return <RenderCard render={render} workspaceId={workspaceId} rendering={busy || renderRunning} onRender={onRender} />;
  }
  if (entry.kind === 'card') {
    const card = entry.meta?.card;
    if (folded) return <FoldedLine text={`${CARD_NAMES[card] || card} diperbarui`} onOpen={() => onOpenPanel(card === 'shots' ? null : card)} />;
    return <ArtifactCard card={card} board={board} workspaceId={workspaceId} onOpen={onOpenPanel} busy={busy} />;
  }
  if (entry.kind === 'request') {
    const request = board.requests.find((r) => r.id === entry.meta?.request_id);
    if (request && (request.status === 'superseded' || request.status === 'rejected')) {
      return <FoldedLine text={`Estimasi generate ${requestSummary(request.estimate || {})} — ${REQUEST_STATUS[request.status].label.toLowerCase()}`} />;
    }
    return <RequestCard request={request} board={board} workspaceId={workspaceId} busy={busy} generationRunning={generationRunning}
      onApprove={(skip, estimate) => onApprove(request, skip, estimate)} onReject={() => onReject(request)} />;
  }
  if (entry.kind === 'edit' || entry.kind === 'approval') {
    return <div className="text-right text-[10.5px] text-white/40">{entry.kind === 'edit' ? '✎ ' : '✓ '}{entry.text}</div>;
  }
  if (entry.role === 'user') return <UserMessage entry={entry} workspaceId={workspaceId} videoNotes={board.video_notes} />;
  if (entry.kind === 'error') return <p className="text-[11.5px] leading-relaxed text-red-300/90">{entry.text}</p>;
  if (entry.kind === 'generation') {
    return <div className="flex items-center gap-2 text-[11.5px] text-white/80"><CheckIcon />{entry.text}</div>;
  }
  return <div className="text-[11.5px] leading-[1.7] text-[#e6e7ea]"><Markdown text={entry.text} /></div>;
}

// The streamed reply typed out at a steady pace (about 70 characters a second, faster when far behind),
// instead of jumping by whole chunks as they arrive.
function useTypewriter(target) {
  const [shown, setShown] = useState('');
  useEffect(() => {
    if (!target) { setShown(''); return undefined; }
    let frame;
    let last = performance.now();
    const step = (time) => {
      const elapsed = (time - last) / 1000;
      last = time;
      setShown((current) => {
        const base = target.startsWith(current) ? current : ''; // a new step's reply starts over
        const behind = target.length - base.length;
        if (behind <= 0) return target;
        const add = Math.max(1, Math.round(elapsed * Math.max(70, behind * 1.5)));
        return target.slice(0, base.length + add);
      });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

export default function ChatTimeline({ chat, board, workspaceId, busy, generationRunning, renderRunning, agentRunning, onApprove, onReject, onOpenPanel, onRender, draft, onContinue }) {
  const blocks = groupEntries(chat);
  // Every card shows the board as it is now, so only the newest card of each kind is drawn in full.
  const newest = {};
  blocks.forEach((block) => { if (block.type !== 'steps' && block.entry.kind === 'card') newest[block.entry.meta?.card] = block.key; });
  // The draft stays until the saved message with the same text is in the chat, then the message takes its place.
  const lastReply = [...chat].reverse().find((entry) => entry.role === 'assistant' && entry.kind === 'message');
  const pending = draft && !(lastReply && lastReply.text.trim() === draft.trim()) ? draft : '';
  const typed = useTypewriter(pending);
  return (
    <div className="space-y-4">
      {blocks.map((block, i) => block.type === 'steps' ? (
        <StepGroup key={block.key} items={block.items} live={agentRunning && i === blocks.length - 1} />
      ) : (
        <Entry key={block.key} entry={block.entry} board={board} workspaceId={workspaceId} busy={busy}
          generationRunning={generationRunning} renderRunning={renderRunning} onApprove={onApprove} onReject={onReject}
          onOpenPanel={onOpenPanel} onRender={onRender} onContinue={onContinue}
          folded={block.entry.kind === 'card' && newest[block.entry.meta?.card] !== block.key} />
      ))}
      {pending && (
        // The reply as it is being written; replaced by the saved message when the step ends.
        <div className="text-[11.5px] leading-[1.7] text-[#e6e7ea]"><Markdown text={typed} /><span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-[#d4ff64]/70 align-middle" /></div>
      )}
      {agentRunning && !pending && blocks[blocks.length - 1]?.type !== 'steps' && (
        <div className="flex items-center gap-2 text-[10.5px] text-white/40"><Spinner /> Director sedang bekerja…</div>
      )}
    </div>
  );
}
