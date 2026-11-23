'use client';

// The Director conversation: centered agent identity header, soft neutral assistant bubbles,
// quiet collapsible step traces, and spacious full-width artifact / generation cards.

import { Fragment, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  Download,
  FileText,
  Music,
  Pencil,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  Users,
  Wand2,
} from 'lucide-react';
import { Badge, assetUrl, fmtCredits } from './BoardViews.js';
import { groupShots } from './Workspace.js';

export function Spinner() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#DDD7FE] border-t-[#5B45F2]"
      aria-hidden="true"
    />
  );
}

const ACCENT = 'text-[#4C38D6]';

export function AgentIdentityHeader({ title, statusLabel, modeLabel }) {
  return (
    <div className="mb-8 flex flex-col items-center text-center">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#5B45F2] text-white shadow-[0_8px_20px_-6px_rgba(91,69,242,0.48)]">
        <Clapperboard size={20} strokeWidth={2.1} aria-hidden="true" />
      </div>
      <div className="mt-2.5 text-[14.5px] font-semibold tracking-[-0.015em] text-[#14141F]">AI Director</div>
      <div className="mt-0.5 text-[12px] text-[#6E6F82]">
        {statusLabel}
        {modeLabel ? ` · ${modeLabel}` : ''}
      </div>
      {title && <div className="mt-2 max-w-[460px] truncate text-[11.5px] text-[#8A8B9C]">{title}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- tiny markdown (answers only)

// **bold**, *italic* / _italic_ (titles); everything else is plain text.
const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*?\*|(?<![\w])_[^_\s][^_\n]*?_(?![\w]))/g;

function inline(text) {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-[#14141F]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (
      (part.startsWith('*') && part.endsWith('*') && part.length > 2) ||
      (part.startsWith('_') && part.endsWith('_') && part.length > 2)
    ) {
      return (
        <em key={i} className="italic">
          {part.slice(1, -1)}
        </em>
      );
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
      if (!list || list.type !== type) {
        list = { type, items: [] };
        blocks.push(list);
      }
      list.items.push(bullet ? bullet[1] : numbered[2]);
      continue;
    }
    list = null;
    if (!line.trim()) {
      blocks.push({ type: 'gap' });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last?.type === 'p') last.lines.push(line);
    else blocks.push({ type: 'p', lines: [line] });
  }
  return (
    <div className="space-y-2.5">
      {blocks.map((block, i) => {
        if (block.type === 'gap') return null;
        if (block.type === 'p') {
          return (
            <p key={i}>
              {block.lines.map((l, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  {inline(l)}
                </Fragment>
              ))}
            </p>
          );
        }
        const List = block.type;
        return (
          <List
            key={i}
            className={`space-y-1.5 pl-5 ${block.type === 'ul' ? 'list-disc' : 'list-decimal'} marker:text-[#8A8B9F]`}
          >
            {block.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- step groups (reasoning)

const CheckIcon = () => (
  <CheckCircle2 size={14} strokeWidth={2} aria-hidden="true" className="flex-none text-[#147A49]" />
);

function stepText(text) {
  return text.startsWith('Membaca skill: ') ? `Reading guide: ${text.slice('Membaca skill: '.length)}` : text;
}

function groupLabel(items) {
  const work = items.filter((e) => !e.text.startsWith('Membaca skill: '));
  if (!work.length) return items.length > 1 ? 'Reading creative guides' : stepText(items[0].text);
  const label = work[work.length - 1].text;
  return work.length > 1 ? `${label} · ${work.length} steps` : label;
}

function StepGroup({ items, live }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex max-w-full items-center gap-1.5 rounded-lg px-1 py-0.5 text-left text-[12.5px] font-medium text-[#8A8B9C] transition hover:text-[#2D2E3F]"
      >
        <ChevronRight
          size={13}
          strokeWidth={2}
          className={`flex-none text-[#9A9BAC] transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
        {live && <Spinner />}
        <span className="truncate">{groupLabel(items)}</span>
      </button>
      {open && (
        <div className="mt-2 ml-1 space-y-2 border-l border-[#EAEAEF] pl-3.5 py-0.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-[12.5px] text-[#4C4D61]">
              <CheckIcon />
              <span>{stepText(item.text)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- cards

function CardShell({ icon, title, accent, badge, children, action, onAction, actionDisabled, actionTone = 'accent', secondary }) {
  const actionStyles =
    actionTone === 'accent'
      ? 'border-[#5B45F2] bg-[#5B45F2] text-white shadow-[0_2px_8px_rgba(91,69,242,0.22)] hover:bg-[#4731D8]'
      : 'border-[#DDD7FE] bg-[#F2F0FF] text-[#4C38D6] hover:border-[#C5BAFC] hover:bg-[#E6E2FF]';
  const inlineHeaderAction = Boolean(action && !secondary);

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-[#E6E7F0] bg-white shadow-[0_2px_10px_rgba(20,20,31,0.035)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFEFF5] bg-[#FAFAFD] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 flex-none place-items-center rounded-xl bg-[#F2F0FF] text-[#5B45F2]">
            {icon}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-[#14141F]">{title}</span>
              {badge}
            </div>
            {accent && <div className="truncate text-[12px] text-[#5E5E72]">{accent}</div>}
          </div>
        </div>
        {inlineHeaderAction && (
          <button
            type="button"
            onClick={onAction}
            disabled={actionDisabled}
            className={`flex-none rounded-xl border px-3.5 py-1.5 text-[12.5px] font-semibold transition disabled:pointer-events-none disabled:opacity-45 ${actionStyles}`}
          >
            {action}
          </button>
        )}
      </div>

      <div className="px-4 py-3.5">{children}</div>

      {!inlineHeaderAction && (action || secondary) && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#EFEFF5] bg-[#FAFAFD] px-4 py-3">
          {secondary}
          {action && (
            <button
              type="button"
              onClick={onAction}
              disabled={actionDisabled}
              className={`rounded-xl border px-4 py-2 text-[12.5px] font-semibold transition disabled:pointer-events-none disabled:opacity-45 ${actionStyles}`}
            >
              {action}
            </button>
          )}
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
        <div
          key={i}
          className={`absolute top-1 h-[62px] w-[62px] overflow-hidden rounded-xl border-2 border-white bg-[#141722] shadow-[0_4px_14px_rgba(20,20,31,0.14)] ${rot[i]} ${pos[i]}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {tile.src ? (
            <img src={tile.src} alt={tile.label} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center px-1.5 text-center text-[10px] font-medium leading-tight text-white/75">
              {tile.label}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const CARD_NAMES = {
  brief: 'Brief',
  concepts: 'Creative direction',
  research: 'Research',
  script: 'Script',
  assets: 'Assets',
  shots: 'Shot list',
  audio: 'Audio',
};

/** An older copy of a card (a newer one is further down) or a closed request: one quiet centered line. */
function FoldedLine({ text, onOpen }) {
  return (
    <div className="flex justify-center py-0.5">
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#7A7B90] transition hover:text-[#4C38D6] disabled:hover:text-[#7A7B90]"
      >
        <RotateCcw size={11.5} strokeWidth={2} className="text-[#9A9BAC]" aria-hidden="true" />
        <span>{text}</span>
        {onOpen && <ChevronRight size={11.5} aria-hidden="true" />}
      </button>
    </div>
  );
}

function ArtifactCard({ card, board, workspaceId, onOpen }) {
  if (card === 'script') {
    if (!board.script) return null;
    const lineCount = (board.script.text || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean).length;
    return (
      <CardShell
        icon={<FileText size={15} strokeWidth={2} aria-hidden="true" />}
        title="Script"
        accent={board.script.title || `${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`}
        badge={board.script.locked ? <Badge tone="green">Confirmed</Badge> : null}
        action="Open script"
        actionTone="soft"
        onAction={() => onOpen('script')}
      >
        <div className="rounded-xl border border-[#ECECF4] bg-[#FAFAFD] px-3.5 py-3">
          <p className="line-clamp-4 whitespace-pre-line text-[13px] leading-[1.68] text-[#2D2E3F]">
            {board.script.text}
          </p>
        </div>
        <div className="mt-2.5 flex items-center justify-between text-[11.5px] text-[#7A7B90]">
          <span>{lineCount} {lineCount === 1 ? 'line' : 'lines'} · ready to review or edit</span>
          <span>Click to read full script</span>
        </div>
      </CardShell>
    );
  }
  if (card === 'brief') {
    const brief = board.brief || {};
    const chips = [
      brief.duration_seconds ? `${brief.duration_seconds}s` : null,
      brief.aspect_ratio || null,
      brief.resolution || null,
      brief.product ? `Product: ${brief.product}` : null,
      brief.audience ? `Audience: ${brief.audience}` : null,
      brief.goal ? `Goal: ${brief.goal}` : null,
    ].filter(Boolean);
    return (
      <CardShell
        icon={<Target size={15} strokeWidth={2} aria-hidden="true" />}
        title="Production Brief"
        accent={brief.style || 'Video direction summary'}
        badge={brief.locked ? <Badge tone="green">Locked</Badge> : null}
        action="View brief"
        actionTone="soft"
        onAction={() => onOpen('brief')}
      >
        <p className="line-clamp-3 text-[13.5px] leading-[1.65] text-[#1E1E28]">{brief.summary}</p>
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.slice(0, 5).map((chip) => (
              <span
                key={chip}
                className="inline-flex max-w-full truncate rounded-lg border border-[#E6E7F0] bg-[#F8F8FC] px-2.5 py-1 text-[11.5px] font-medium text-[#4C4D61]"
              >
                {chip}
              </span>
            ))}
          </div>
        )}
      </CardShell>
    );
  }
  if (card === 'assets') {
    const kinds = [
      ['character', 'Characters'],
      ['location', 'Locations'],
      ['prop', 'Props'],
    ];
    return (
      <CardShell
        icon={<Users size={15} strokeWidth={2} aria-hidden="true" />}
        title="Story Assets"
        accent={`${board.elements.length} ${board.elements.length === 1 ? 'element' : 'elements'} ready to review`}
        action="View assets"
        actionTone="soft"
        onAction={() => onOpen('assets')}
      >
        <div className="flex items-center gap-4">
          <Stack
            items={board.elements.map((e) => ({
              src: assetUrl(board.media[`element:${e.id}`]?.asset_id, workspaceId, true),
              label: e.name,
            }))}
          />
          <div className="min-w-0 space-y-1.5 text-[13px] font-medium text-[#14141F]">
            {kinds.map(([kind, label]) => {
              const items = board.elements.filter((e) => e.kind === kind);
              if (!items.length) return null;
              return (
                <p key={kind} className="truncate">
                  {label}
                  {items.length === 1 ? ` — ${items[0].name}` : ''} <span className="text-[#5B45F2]">× {items.length}</span>
                </p>
              );
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
      <CardShell
        icon={<Clapperboard size={15} strokeWidth={2} aria-hidden="true" />}
        title={numbered.length ? 'Shot list' : 'Scene list'}
        accent={numbered.length ? `${total}s · ${numbered.length} ${numbered.length === 1 ? 'shot' : 'shots'}` : 'no shots yet'}
        action="View board"
        actionTone="accent"
        onAction={() => onOpen(null)}
      >
        <div className="flex items-center gap-4">
          <Stack
            items={numbered.map((n) => ({
              src: assetUrl(board.media[`frame:${n.shot.id}`]?.asset_id, workspaceId, true),
              label: n.shot.title,
            }))}
          />
          <div className="min-w-0 space-y-1.5 text-[13px] font-medium text-[#14141F]">
            {board.scenes?.length > 0 && (
              <p>
                Scenes <span className="text-[#5B45F2]">× {board.scenes.length}</span>
              </p>
            )}
            {numbered.length > 0 && (
              <p>
                Shots <span className="text-[#5B45F2]">× {numbered.length}</span>
              </p>
            )}
          </div>
        </div>
      </CardShell>
    );
  }
  if (card === 'concepts') {
    const concepts = board.concepts || { options: [] };
    return (
      <CardShell
        icon={<Sparkles size={15} strokeWidth={2} aria-hidden="true" />}
        title="Creative Direction"
        accent={`${concepts.options.length} concept ${concepts.options.length === 1 ? 'option' : 'options'}`}
        badge={concepts.chosen ? <Badge tone="green">Selected</Badge> : <Badge tone="accent">Action needed</Badge>}
        action={concepts.chosen ? 'View concepts' : 'Choose concept'}
        actionTone={concepts.chosen ? 'soft' : 'accent'}
        onAction={() => onOpen('concepts')}
      >
        <ul className="space-y-2">
          {concepts.options.map((o, idx) => {
            const isChosen = concepts.chosen === o.id;
            return (
              <li
                key={o.id}
                className={`rounded-xl border px-3 py-2.5 transition ${
                  isChosen
                    ? 'border-[#C5BAFC] bg-[#F6F4FF]'
                    : 'border-[#EFEFF5] bg-[#FAFAFD]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`inline-flex h-5 w-5 flex-none items-center justify-center rounded-md text-[10.5px] font-bold ${
                        isChosen ? 'bg-[#5B45F2] text-white' : 'bg-[#F2F0FF] text-[#4C38D6]'
                      }`}
                    >
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="truncate text-[13px] font-semibold text-[#14141F]">{o.title}</span>
                  </div>
                  <span className="flex flex-none items-center gap-1.5">
                    {concepts.recommended === o.id && <Badge tone="accent">Recommended</Badge>}
                    {isChosen && <Badge tone="green">Selected</Badge>}
                  </span>
                </div>
                {o.logline && (
                  <p className="mt-1.5 line-clamp-2 pl-7 text-[12px] leading-relaxed text-[#5E5E72]">{o.logline}</p>
                )}
              </li>
            );
          })}
        </ul>
      </CardShell>
    );
  }
  if (card === 'audio') {
    const audio = board.audio || {};
    const chosen = audio.options?.find((o) => o.id === audio.chosen);
    const voLines = board.shots.filter((s) => s.vo_text).length;
    const lines = [
      voLines
        ? `VO (${audio.voiceover?.voice_name || 'voice'}): ${voLines} ${voLines === 1 ? 'line' : 'lines'} across ${voLines} ${voLines === 1 ? 'shot' : 'shots'}`
        : audio.voiceover?.text && `VO (${audio.voiceover.voice_name || 'voice'}): ${audio.voiceover.text}`,
      audio.music?.prompt && `Music: ${audio.music.prompt}`,
    ].filter(Boolean);
    const options = audio.options?.length && !audio.chosen;
    const accent = audio.chosen === 'none' ? 'no audio' : chosen ? chosen.title : options ? `${audio.options.length} proposals` : null;
    return (
      <CardShell
        icon={<Music size={15} strokeWidth={2} aria-hidden="true" />}
        title="Audio"
        accent={accent}
        action={options ? 'Review & choose' : 'View audio'}
        actionTone={options ? 'accent' : 'soft'}
        onAction={() => onOpen('audio')}
      >
        {options ? (
          <ul className="divide-y divide-[#F2F2F7]">
            {audio.options.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0 text-[13px] font-medium text-[#2D2E3F]">
                <span className="truncate">{o.title}</span>
                {audio.recommended === o.id && <Badge tone="accent">recommended</Badge>}
              </li>
            ))}
          </ul>
        ) : lines.length ? (
          lines.map((line) => (
            <p key={line} className="line-clamp-2 text-[13px] leading-relaxed text-[#3A3B4C]">
              {line}
            </p>
          ))
        ) : (
          <p className="text-[13px] text-[#8A8B9C]">No voiceover or music.</p>
        )}
      </CardShell>
    );
  }
  if (card === 'research') {
    const latest = board.research[board.research.length - 1];
    if (!latest) return null;
    return (
      <CardShell
        icon={<Search size={15} strokeWidth={2} aria-hidden="true" />}
        title="Research"
        accent={latest.query}
        action="View research"
        actionTone="soft"
        onAction={() => onOpen('research')}
      >
        <p className="line-clamp-3 text-[13px] leading-relaxed text-[#3A3B4C]">{latest.notes}</p>
      </CardShell>
    );
  }
  return null;
}

export function requestSummary(estimate) {
  const parts = [];
  if (estimate.images) parts.push(`${estimate.images} ${estimate.images === 1 ? 'image' : 'images'}`);
  if (estimate.videos) {
    parts.push(
      estimate.video_seconds
        ? `${estimate.videos} ${estimate.videos === 1 ? 'video' : 'videos'} (${estimate.video_seconds}s)`
        : `${estimate.videos} ${estimate.videos === 1 ? 'video' : 'videos'}`
    );
  }
  if (estimate.audio) parts.push(`${estimate.audio} audio`);
  return parts.join(' + ');
}

const REQUEST_STATUS = {
  pending: { label: 'Awaiting approval', tone: 'accent' },
  running: { label: 'Generating', tone: 'amber' },
  done: { label: 'Done', tone: 'green' },
  failed: { label: 'Partially failed', tone: 'red' },
  rejected: { label: 'Cancelled', tone: 'default' },
  superseded: { label: 'Replaced by new estimate', tone: 'default' },
  needs_credits: { label: 'Insufficient credits', tone: 'amber' },
};

// Voiceover lines and music are never needed to make the video: on a pending card they start unticked.
const isOptional = (key) => key.startsWith('vo:') || key.startsWith('audio:');

function RequestCard({ request, board, workspaceId, busy, generationRunning, onApprove, onReject }) {
  // Optional when it comes with frames or videos; a card of audio alone was asked for on purpose, so it starts ticked.
  const [ticked, setTicked] = useState(() => (request?.items?.length && request.items.every(isOptional) ? request.items : []));
  if (!request) return null;
  const auto = !!request.auto;
  const status = auto && request.status === 'pending' ? { label: 'Queued', tone: 'amber' } : REQUEST_STATUS[request.status] || REQUEST_STATUS.pending;
  const pending = request.status === 'pending' && !auto;
  const optional = pending ? request.items.filter(isOptional) : [];
  const skip = optional.filter((k) => !ticked.includes(k));
  const required = request.items.filter((k) => !skip.includes(k));
  const base = request.estimate || {};
  const left = skip.reduce((sum, k) => sum + Number(request.item_estimates?.[k]?.credits || 0), 0);
  const estimate = skip.length
    ? { ...base, audio: Math.max(0, (base.audio || 0) - skip.length), credits: Math.max(0, (base.credits || 0) - left) }
    : base;
  const nothing = pending && required.length === 0;
  return (
    <CardShell
      icon={<Wand2 size={15} strokeWidth={2} aria-hidden="true" />}
      title={`Generate ${requestSummary(estimate) || 'audio'}`}
      accent={auto ? 'automatic' : status.label}
      action={pending ? 'Approve & generate' : null}
      actionTone="accent"
      onAction={() => onApprove(skip, estimate)}
      actionDisabled={busy || generationRunning || !base.available || nothing}
      secondary={
        pending ? (
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="rounded-xl border border-[#D8DAE6] bg-white px-4 py-2 text-[12.5px] font-medium text-[#4C4D61] transition hover:border-[#BFC2D4] hover:bg-[#F5F6FA] hover:text-[#14141F] disabled:opacity-45"
          >
            Cancel
          </button>
        ) : null
      }
    >
      <div className="flex items-start gap-4">
        <Stack
          items={required.map((k) => ({
            src: board.media[k]?.kind === 'audio' ? null : assetUrl(board.media[k]?.asset_id, workspaceId, true),
            label: (board.media[k]?.label || k).replace(' — reference sheet', ''),
          }))}
        />
        <div className="min-w-0 flex-1">
          <div className="mb-2">
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <ul className="space-y-1">
            {required
              .filter((k) => !optional.includes(k))
              .slice(0, 4)
              .map((key) => (
                <li key={key} className="truncate text-[12.5px] text-[#4C4D61]">
                  {board.media[key]?.label || key}
                </li>
              ))}
            {required.length - optional.filter((k) => ticked.includes(k)).length > 4 && (
              <li className="text-[11.5px] text-[#8A8B9C]">
                +{required.length - optional.filter((k) => ticked.includes(k)).length - 4} more
              </li>
            )}
          </ul>
          {optional.length > 0 && (
            <div className="mt-2.5 border-t border-[#EFEFF5] pt-2.5">
              <p className="mb-1 text-[11px] font-medium text-[#8A8B9C]">Optional — check to include in generation:</p>
              {optional.map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2 py-0.5 text-[12px] text-[#3A3B4C]"
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded accent-[#5B45F2]"
                    checked={ticked.includes(key)}
                    disabled={busy}
                    onChange={(e) => setTicked(e.target.checked ? [...ticked, key] : ticked.filter((k) => k !== key))}
                  />
                  <span className="truncate">{board.media[key]?.label || key}</span>
                  {request.item_estimates?.[key] && (
                    <span className="ml-auto flex-none text-[11px] text-[#8A8B9C]">
                      {fmtCredits(request.item_estimates[key].credits)} cr
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
          <p className="mt-2.5 text-[13px] text-[#2D2E3F]">
            {estimate.available ? (
              <>
                {auto ? 'Cost' : 'Estimated'}{' '}
                <strong className={`font-semibold ${ACCENT}`}>{fmtCredits(estimate.credits)} credits</strong>
              </>
            ) : (
              <span className="text-[#A05C07]">Credit estimate is not available yet.</span>
            )}
          </p>
        </div>
      </div>
      {pending && generationRunning && (
        <p className="mt-2.5 text-[11.5px] text-[#8A8B9C]">Wait for the current generation to finish first.</p>
      )}
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
  if (render.stills) notes.push(`${render.stills} ${render.stills === 1 ? 'shot is' : 'shots are'} still frames`);
  if (render.skipped) notes.push(`${render.skipped} ${render.skipped === 1 ? 'shot' : 'shots'} skipped (no image yet)`);
  return (
    <CardShell
      icon={<Play size={14} fill="currentColor" aria-hidden="true" />}
      title="Final video"
      accent={done ? fmtDuration(render.duration_seconds) : failed ? 'failed' : 'rendering'}
      action={done || failed ? (failed ? 'Retry render' : 'Re-render') : null}
      actionTone="soft"
      onAction={onRender}
      actionDisabled={rendering}
      secondary={
        done && src ? (
          <a
            href={`${src}&download=1`}
            download
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#5B45F2] px-4 py-2 text-[12.5px] font-semibold text-white shadow-[0_2px_8px_rgba(91,69,242,0.22)] transition hover:bg-[#4731D8]"
          >
            <Download size={14} strokeWidth={2.2} aria-hidden="true" />
            <span>Download</span>
          </a>
        ) : null
      }
    >
      {done && src ? (
        <video src={src} controls preload="metadata" playsInline className="w-full rounded-xl bg-[#0F1117]" />
      ) : done ? (
        <p className="text-[12.5px] leading-relaxed text-[#5E5E72]">
          This older render file was removed to save storage (the last 3 renders are kept). Re-render if you still need it.
        </p>
      ) : failed ? (
        <p className="text-[12.5px] leading-relaxed text-[#C01048]">{render.error || 'Render failed.'}</p>
      ) : (
        <div>
          <div className="flex items-center gap-2 text-[12.5px] font-medium text-[#2D2E3F]">
            <Spinner />{' '}
            {progress.done < progress.total
              ? `Combining shot ${Math.min(progress.done + 1, progress.total)}/${progress.total}`
              : 'Saving video…'}
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[#ECECF4]">
            <div className="h-full rounded-full bg-[#5B45F2] transition-all" style={{ width: `${Math.max(4, pct)}%` }} />
          </div>
        </div>
      )}
      <p className="mt-2.5 text-[11.5px] text-[#8A8B9C]">
        {render.shots?.length || 0} {render.shots?.length === 1 ? 'shot' : 'shots'} · {render.aspect_ratio} · {render.resolution}
        {render.fps ? ` · ${render.fps} fps` : ''}
        {render.format ? ` · ${render.format.toUpperCase()}` : ''}
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
    <CardShell
      icon={<AlertCircle size={15} strokeWidth={2.1} aria-hidden="true" />}
      title="Insufficient credits"
      accent={held ? 'paused' : 'resumed'}
      action={held ? 'Continue' : null}
      actionTone="accent"
      onAction={() => onContinue(request)}
      actionDisabled={busy}
      secondary={
        held ? (
          <a
            href="/studio/billing"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-xl border border-[#DDD7FE] bg-[#F2F0FF] px-4 py-2 text-[12.5px] font-semibold text-[#4C38D6] transition hover:bg-[#E6E2FF]"
          >
            Top up
          </a>
        ) : null
      }
    >
      <p className="text-[13px] leading-relaxed text-[#2D2E3F]">
        This step needs <strong className={`font-semibold ${ACCENT}`}>{fmtCredits(gate.needed)} credits</strong>; your balance is{' '}
        {fmtCredits(gate.balance)}.
      </p>
      <p className="mt-1.5 text-[12px] text-[#5E5E72]">
        {held ? 'Your work is safe. Top up first, then click Continue.' : 'Resumed.'}
      </p>
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
      if (i >= 0 && (at < 0 || i < at)) {
        at = i;
        hit = label;
      }
    }
    if (hit === null) {
      parts.push(rest);
      break;
    }
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
    <div className="flex flex-col items-end gap-2">
      {attachments.length > 0 && (
        <div className="flex max-w-[82%] flex-wrap justify-end gap-2">
          {attachments.map((a) => (
            <a
              key={a.asset_id}
              href={assetUrl(a.asset_id, workspaceId)}
              target="_blank"
              rel="noreferrer"
              title={a.name}
              className="relative h-16 w-16 overflow-hidden rounded-xl border border-[#E2E3EC] bg-[#11141C] shadow-xs"
            >
              {a.kind === 'video' ? (
                <video
                  src={`${assetUrl(a.asset_id, workspaceId)}#t=0.5`}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assetUrl(a.asset_id, workspaceId, true)} alt={a.name} className="h-full w-full object-cover" />
              )}
              {a.kind === 'video' && (
                <span className="absolute bottom-1 left-1 inline-flex h-4 w-4 items-center justify-center rounded bg-black/75 text-white">
                  <Play size={8} fill="currentColor" aria-hidden="true" />
                </span>
              )}
            </a>
          ))}
        </div>
      )}
      {watched.map((a) => (
        <details
          key={a.asset_id}
          className="max-w-[82%] rounded-xl border border-[#EAEAEF] bg-[#FAFAFD] px-3.5 py-2 text-[12px] text-[#4C4D61]"
        >
          <summary className="cursor-pointer font-medium text-[#5E5E72] hover:text-[#14141F]">
            AI watch notes · {a.name || 'video'}
          </summary>
          <p className="mt-1.5 whitespace-pre-line leading-relaxed">{videoNotes[a.asset_id]}</p>
        </details>
      ))}
      <div className="max-w-[82%] whitespace-pre-line break-words rounded-[18px] rounded-br-[6px] border border-[#DFDAFE] bg-[#F2F0FF] px-4 py-2.5 text-[13.5px] leading-[1.64] text-[#1A1638]">
        {splitMentions(entry.text, labels).map((part, i) =>
          labels.includes(part) ? (
            <span key={i} className="rounded-md bg-[#5B45F2]/12 px-1.5 py-0.5 font-medium text-[#4C38D6]">
              {part}
            </span>
          ) : (
            <Fragment key={i}>{part}</Fragment>
          )
        )}
      </div>
    </div>
  );
}

function Entry({
  entry,
  board,
  workspaceId,
  busy,
  generationRunning,
  renderRunning,
  onApprove,
  onReject,
  onOpenPanel,
  onRender,
  onContinue,
  folded,
}) {
  if (entry.kind === 'credit_gate') {
    return <CreditGateCard entry={entry} board={board} busy={busy} onContinue={onContinue} />;
  }
  if (entry.kind === 'render') {
    const render = (board.renders || []).find((r) => r.id === entry.meta?.render_id);
    return <RenderCard render={render} workspaceId={workspaceId} rendering={busy || renderRunning} onRender={onRender} />;
  }
  if (entry.kind === 'card') {
    const card = entry.meta?.card;
    if (folded) {
      return (
        <FoldedLine
          text={`${CARD_NAMES[card] || card} updated`}
          onOpen={() => onOpenPanel(card === 'shots' ? null : card)}
        />
      );
    }
    return <ArtifactCard card={card} board={board} workspaceId={workspaceId} onOpen={onOpenPanel} />;
  }
  if (entry.kind === 'request') {
    const request = board.requests.find((r) => r.id === entry.meta?.request_id);
    if (request && (request.status === 'superseded' || request.status === 'rejected')) {
      return (
        <FoldedLine
          text={`Generation estimate ${requestSummary(request.estimate || {})} — ${REQUEST_STATUS[request.status].label.toLowerCase()}`}
        />
      );
    }
    return (
      <RequestCard
        request={request}
        board={board}
        workspaceId={workspaceId}
        busy={busy}
        generationRunning={generationRunning}
        onApprove={(skip, estimate) => onApprove(request, skip, estimate)}
        onReject={() => onReject(request)}
      />
    );
  }
  if (entry.kind === 'edit' || entry.kind === 'approval') {
    return (
      <div className="flex items-center justify-center gap-1.5 py-0.5 text-[12px] text-[#9495A6]">
        {entry.kind === 'edit' ? <Pencil size={11} aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}
        <span>{entry.text}</span>
      </div>
    );
  }
  if (entry.role === 'user') return <UserMessage entry={entry} workspaceId={workspaceId} videoNotes={board.video_notes} />;
  if (entry.kind === 'error') {
    return (
      <p className="rounded-2xl border border-[#FCCDD6] bg-[#FFF1F3] px-4 py-3 text-[13px] leading-relaxed text-[#C01048]">
        {entry.text}
      </p>
    );
  }
  if (entry.kind === 'generation') {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[#C5F0D6] bg-[#ECFDF3] px-4 py-2.5 text-[13px] font-medium text-[#147A49]">
        <CheckIcon />
        <span>{entry.text}</span>
      </div>
    );
  }
  return (
    <div className="w-fit max-w-full rounded-[18px] bg-[#F1F1F4] px-4 py-3 text-[13.5px] leading-[1.68] text-[#1E1E28]">
      <Markdown text={entry.text} />
    </div>
  );
}

// The streamed reply typed out at a steady pace (about 70 characters a second, faster when far behind),
// instead of jumping by whole chunks as they arrive.
function useTypewriter(target) {
  const [shown, setShown] = useState('');
  useEffect(() => {
    if (!target) {
      setShown('');
      return undefined;
    }
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

export default function ChatTimeline({
  chat,
  board,
  workspaceId,
  busy,
  generationRunning,
  renderRunning,
  agentRunning,
  onApprove,
  onReject,
  onOpenPanel,
  onRender,
  draft,
  onContinue,
  projectTitle,
  runMode,
  needsApproval,
}) {
  const blocks = groupEntries(chat);
  // Every card shows the board as it is now, so only the newest card of each kind is drawn in full.
  const newest = {};
  blocks.forEach((block) => {
    if (block.type !== 'steps' && block.entry.kind === 'card') newest[block.entry.meta?.card] = block.key;
  });
  // The draft stays until the saved message with the same text is in the chat, then the message takes its place.
  const lastReply = [...chat].reverse().find((entry) => entry.role === 'assistant' && entry.kind === 'message');
  const pending = draft && !(lastReply && lastReply.text.trim() === draft.trim()) ? draft : '';
  const typed = useTypewriter(pending);
  const statusLabel = agentRunning
    ? 'Working…'
    : needsApproval
    ? 'Awaiting approval'
    : generationRunning
    ? 'Generating media…'
    : 'Ready to help';
  const modeLabel = runMode === 'auto' ? 'Autopilot' : 'Guided';

  return (
    <div>
      <AgentIdentityHeader title={projectTitle} statusLabel={statusLabel} modeLabel={modeLabel} />
      <div className="space-y-4">
        {blocks.map((block, i) =>
          block.type === 'steps' ? (
            <StepGroup key={block.key} items={block.items} live={agentRunning && i === blocks.length - 1} />
          ) : (
            <Entry
              key={block.key}
              entry={block.entry}
              board={board}
              workspaceId={workspaceId}
              busy={busy}
              generationRunning={generationRunning}
              renderRunning={renderRunning}
              onApprove={onApprove}
              onReject={onReject}
              onOpenPanel={onOpenPanel}
              onRender={onRender}
              onContinue={onContinue}
              folded={block.entry.kind === 'card' && newest[block.entry.meta?.card] !== block.key}
            />
          )
        )}
        {pending && (
          // The reply as it is being written; replaced by the saved message when the step ends.
          <div className="w-fit max-w-full rounded-[18px] bg-[#F1F1F4] px-4 py-3 text-[13.5px] leading-[1.68] text-[#1E1E28]">
            <Markdown text={typed} />
            <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-[#5B45F2] align-middle" />
          </div>
        )}
        {agentRunning && !pending && blocks[blocks.length - 1]?.type !== 'steps' && (
          <div className="inline-flex items-center gap-2 px-1 text-[12.5px] font-medium text-[#8A8B9C]">
            <Spinner />
            <span>Director is thinking…</span>
          </div>
        )}
      </div>
    </div>
  );
}
