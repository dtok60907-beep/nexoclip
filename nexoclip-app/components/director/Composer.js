'use client';

// Floating pill composer & Home-grade Hero composer:
// attachments (+), @mentions, auto-growing input, optional animated typewriter placeholder,
// send action, and quiet controls for credits, run mode (Pandu aku / Langsung jadi), and AI model.

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AtSign, ChevronDown, Play, Plus, SendHorizontal, Sparkles, X } from 'lucide-react';
import { groupShots } from './Workspace.js';

const MAX_ATTACHMENTS = 10;

export const RUN_MODES = [
  ['guide', 'Guided', 'Director pauses at each step to ask for your approval (concepts, audio, credits).'],
  ['auto', 'Autopilot', 'Director decides and runs automatically through to the final video, auto-approving credits.'],
];

// The Director's text model; it also looks at the images and videos attached in the chat.
export const LLM_MODELS = [
  ['seed', 'Seed 2.1', 'Seed 2.1 Turbo (BytePlus): default model, most credit-efficient.'],
  ['grok', 'Grok 4.5', 'Grok 4.5 (xAI, via OpenRouter): Director and attachment image/video analysis run on Grok. Chat credits are ~3x Seed.'],
];

const DEFAULT_HERO_PROMPTS = [
  'Create a 15-second 9:16 F&B ad for an artisanal iced drink, featuring a crisp close-up pour shot…',
  '20-second 9:16 UGC video for daily skincare, strong 3-second hook and close-up product texture demo…',
  '15-second 9:16 affiliate promo video with a problem-solution hook, fast cuts, and a clear CTA…',
  '20-second 3D animated teaser for a lifestyle product launch with a smooth orbiting camera…',
];

const DirectorTypewriter = memo(function DirectorTypewriter({ phrases, fallback }) {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    setTyped('');
  }, [phrases]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setTyped(phrases[0] || fallback || '');
      return undefined;
    }

    let phraseIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let timerId = null;

    const tick = () => {
      const current = phrases[phraseIndex % phrases.length] || '';
      if (!deleting) {
        charIndex = Math.min(charIndex + 1, current.length);
        setTyped(current.slice(0, charIndex));
        if (charIndex >= current.length) {
          deleting = true;
          timerId = window.setTimeout(tick, 2200);
          return;
        }
        timerId = window.setTimeout(tick, 40);
      } else {
        charIndex = Math.max(charIndex - 1, 0);
        setTyped(current.slice(0, charIndex));
        if (charIndex === 0) {
          deleting = false;
          phraseIndex = (phraseIndex + 1) % phrases.length;
          timerId = window.setTimeout(tick, 340);
          return;
        }
        timerId = window.setTimeout(tick, 20);
      }
    };

    timerId = window.setTimeout(tick, 320);
    return () => {
      if (timerId) window.clearTimeout(timerId);
    };
  }, [phrases, fallback]);

  return (
    <div className="dr-composer-typewriter" aria-hidden="true">
      <span>{typed}</span>
      <i className="dr-composer-caret" />
    </div>
  );
});

async function upload(file, workspaceId) {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch('/api/uploads', { method: 'POST', headers: { 'x-workspace-id': workspaceId }, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) throw new Error(data.error || 'Upload failed');
  return data.id;
}

function mentionOptions(board) {
  if (!board) return [];
  const { numbered } = groupShots(board);
  return [
    ...numbered.map((n) => ({ type: 'shot', id: n.shot.id, label: n.label, hint: n.shot.title })),
    ...board.elements.map((e) => ({
      type: 'element',
      id: e.id,
      label: e.name.replace(/\s+/g, ''),
      hint: e.kind === 'character' ? 'character' : e.kind === 'location' ? 'location' : 'prop',
    })),
  ];
}

export default function Composer({
  value,
  onChange,
  onSubmit,
  disabled,
  sending,
  placeholder,
  workspaceId,
  board,
  runMode,
  onRunMode,
  llm,
  onLlm,
  rows = 1,
  large = false,
  hero = false,
  typingPrompts = null,
  textareaRef = null,
  metaLeft = null,
  metaRight = null,
}) {
  const [attachments, setAttachments] = useState([]); // {key, file, preview, kind, name, asset_id?, error?}
  const [mentions, setMentions] = useState([]);
  const [query, setQuery] = useState(null); // {start, text} while typing "@..."
  const [active, setActive] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const internalTextarea = useRef(null);
  const textarea = textareaRef || internalTextarea;
  const options = useMemo(() => mentionOptions(board), [board]);
  const phrases = useMemo(
    () => (Array.isArray(typingPrompts) && typingPrompts.length > 0 ? typingPrompts : DEFAULT_HERO_PROMPTS),
    [typingPrompts]
  );
  const matches = query
    ? options.filter((o) => `${o.label} ${o.hint}`.toLowerCase().includes(query.text.toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => () => attachments.forEach((a) => a.preview && URL.revokeObjectURL(a.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const isExpanded = hero || large;

  // Auto-size textarea smoothly so single-line composer stays crisp and expands cleanly for longer messages.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = hero ? 220 : large ? 220 : 160;
    const minHeight = hero ? 76 : large ? 68 : 26;
    el.style.height = `${Math.max(minHeight, Math.min(el.scrollHeight, maxHeight))}px`;
  }, [value, large, hero]);

  const add = (files) => {
    const picked = [...files]
      .filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'))
      .slice(0, MAX_ATTACHMENTS - attachments.length);
    if (!picked.length || !workspaceId) return;
    const items = picked.map((file) => ({
      key: `${file.name}-${file.size}-${Math.random()}`,
      file,
      name: file.name,
      kind: file.type.startsWith('video/') ? 'video' : 'image',
      preview: URL.createObjectURL(file),
    }));
    setAttachments((list) => [...list, ...items]);
    items.forEach(async (item) => {
      try {
        const assetId = await upload(item.file, workspaceId);
        setAttachments((list) => list.map((a) => (a.key === item.key ? { ...a, asset_id: assetId } : a)));
      } catch (err) {
        setAttachments((list) => list.map((a) => (a.key === item.key ? { ...a, error: err.message } : a)));
      }
    });
  };
  const remove = (key) =>
    setAttachments((list) => {
      const gone = list.find((a) => a.key === key);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return list.filter((a) => a.key !== key);
    });

  const uploading = attachments.some((a) => !a.asset_id && !a.error);
  const canSubmit = !disabled && !sending && !uploading && value.trim();
  const submit = async () => {
    if (!canSubmit) return;
    const ok = await onSubmit(value.trim(), {
      attachments: attachments
        .filter((a) => a.asset_id)
        .map((a) => ({ asset_id: a.asset_id, kind: a.kind, name: a.name.slice(0, 200) })),
      mentions: mentions.filter((m) => value.includes(`@${m.label}`)),
    });
    if (ok !== false) {
      attachments.forEach((a) => a.preview && URL.revokeObjectURL(a.preview));
      setAttachments([]);
      setMentions([]);
    }
  };

  const onText = (event) => {
    onChange(event.target.value);
    const caret = event.target.selectionStart;
    const match = /(^|\s)@([\w.\-]*)$/.exec(event.target.value.slice(0, caret));
    setQuery(match && options.length ? { start: caret - match[2].length - 1, text: match[2] } : null);
    setActive(0);
  };
  const pick = (option) => {
    const end = query.start + 1 + query.text.length;
    const next = `${value.slice(0, query.start)}@${option.label} ${value.slice(end)}`;
    onChange(next);
    setMentions((list) => [...list.filter((m) => m.label !== option.label), { type: option.type, id: option.id, label: option.label }]);
    setQuery(null);
    requestAnimationFrame(() => {
      const at = query.start + option.label.length + 2;
      textarea.current?.focus();
      textarea.current?.setSelectionRange(at, at);
    });
  };
  const onKey = (event) => {
    if (query && matches.length) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((i) => (i + 1) % matches.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        pick(matches[active]);
        return;
      }
      if (event.key === 'Escape') {
        setQuery(null);
        return;
      }
    }
    if (event.key === 'Enter' && (isExpanded ? event.metaKey || event.ctrlKey : !event.shiftKey)) {
      event.preventDefault();
      submit();
    }
  };

  const showMetaBar = !hero && Boolean(metaLeft || metaRight || onRunMode || onLlm);

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => {
          if (e.dataTransfer?.types?.includes('Files')) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (e.dataTransfer?.files?.length) {
            e.preventDefault();
            setDragging(false);
            add(e.dataTransfer.files);
          }
        }}
        className={
          hero
            ? `dr-hero-composer relative${dragging ? ' is-dragging' : ''}`
            : `dr-composer-pill relative rounded-[22px] border bg-white transition ${
                large ? 'px-3.5 py-3' : 'px-2.5 py-2'
              } ${
                dragging
                  ? 'border-[#5B45F2] bg-[#F8F7FF] ring-4 ring-[#5B45F2]/12'
                  : 'border-[#E6E7F0] focus-within:border-[#B9AEFC] focus-within:ring-4 focus-within:ring-[#5B45F2]/10'
              }`
        }
      >
        {query && matches.length > 0 && (
          <div className="absolute bottom-full left-2 z-30 mb-2 w-[300px] overflow-hidden rounded-2xl border border-[#E6E7F0] bg-white p-1.5 shadow-[0_14px_36px_rgba(20,20,31,0.12)]">
            {matches.map((o, i) => (
              <button
                key={`${o.type}:${o.id}`}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-[12.5px] transition ${
                  i === active ? 'bg-[#F2F0FF] font-medium text-[#4C38D6]' : 'text-[#2D2E3F] hover:bg-[#F5F6FA]'
                }`}
              >
                <span className="truncate">
                  @{o.label}{' '}
                  <span className={i === active ? 'text-[#5B45F2]/80' : 'text-[#7A7B90]'}>
                    {o.type === 'shot' ? `· ${o.hint}` : ''}
                  </span>
                </span>
                <span
                  className={`flex-none rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ${
                    i === active ? 'bg-white/90 text-[#4C38D6]' : 'bg-[#F2F3F7] text-[#5E5E72]'
                  }`}
                >
                  {o.type === 'shot' ? 'shot' : o.hint}
                </span>
              </button>
            ))}
          </div>
        )}

        {attachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2 px-1">
            {attachments.map((a) => (
              <div
                key={a.key}
                title={a.error || a.name}
                className={`relative h-14 w-14 overflow-hidden rounded-xl border bg-[#11141C] ${
                  a.error ? 'border-[#E11D48]' : 'border-[#DCDDE8]'
                }`}
              >
                {a.kind === 'video' ? (
                  <video src={a.preview} muted playsInline className="h-full w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.preview} alt={a.name} className="h-full w-full object-cover" />
                )}
                {a.kind === 'video' && (
                  <span className="absolute bottom-1 left-1 inline-flex h-4 w-4 items-center justify-center rounded bg-black/75 text-white">
                    <Play size={8} fill="currentColor" aria-hidden="true" />
                  </span>
                )}
                {!a.asset_id && !a.error && (
                  <span className="absolute inset-0 grid place-items-center bg-black/55 text-[10px] font-medium text-white">
                    …
                  </span>
                )}
                {a.error && (
                  <span className="absolute inset-0 grid place-items-center bg-[#C01048]/80 text-[10px] font-medium text-white">
                    failed
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => remove(a.key)}
                  aria-label={`Remove ${a.name}`}
                  className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/75 text-white transition hover:bg-black"
                >
                  <X size={11} strokeWidth={2.4} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={`flex gap-2 ${isExpanded ? 'flex-col' : 'items-end'}`}>
          {hero ? (
            <>
              <div className="relative w-full">
                <textarea
                  ref={textarea}
                  value={value}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onChange={onText}
                  onKeyDown={onKey}
                  rows={rows}
                  onPaste={(e) => {
                    if (e.clipboardData?.files?.length) {
                      e.preventDefault();
                      add(e.clipboardData.files);
                    }
                  }}
                  placeholder={focused ? placeholder : ' '}
                  aria-label="Video brief for AI Director"
                  className="block w-full resize-none bg-transparent px-2 pb-2.5 pt-0 text-[18px] leading-[1.5] text-[#14141F] outline-none placeholder:text-[#747387] max-md:text-[16px]"
                />
                {!value && !focused && <DirectorTypewriter phrases={phrases} fallback={placeholder} />}
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <div className="flex items-center gap-2">
                  <label
                    title="Attach reference images or videos (you can also paste or drag here)"
                    className={`grid h-9 w-9 flex-none cursor-pointer place-items-center rounded-[8px] border border-[#E7E6F0] bg-white text-[#14141F] transition hover:border-[#D4CCFF] hover:bg-[#EDEAFF] hover:text-[#4731D8] ${
                      !workspaceId || attachments.length >= MAX_ATTACHMENTS ? 'pointer-events-none opacity-40' : ''
                    }`}
                  >
                    <Plus size={18} strokeWidth={2} aria-hidden="true" />
                    <input
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      hidden
                      onChange={(e) => {
                        add(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  {onLlm && (
                    <label
                      title="AI model for Director and attachment analysis"
                      className="relative inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[#E7E6F0] bg-white pl-2.5 pr-7 text-[13px] font-medium text-[#555466] transition hover:border-[#C8BFFB] hover:bg-[#F8F7FF] hover:text-[#14141F]"
                    >
                      <Sparkles size={13} strokeWidth={2} className="pointer-events-none text-[#5B45F2]" aria-hidden="true" />
                      <span className="sr-only">AI Director Model</span>
                      <select
                        value={llm || 'seed'}
                        onChange={(e) => onLlm(e.target.value)}
                        title={LLM_MODELS.find(([id]) => id === (llm || 'seed'))?.[2]}
                        className="cursor-pointer appearance-none bg-transparent py-1 text-[13px] font-medium text-inherit outline-none"
                      >
                        {LLM_MODELS.map(([id, label]) => (
                          <option key={id} value={id} className="bg-white text-[#14141F]">
                            {label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={13}
                        strokeWidth={2.2}
                        aria-hidden="true"
                        className="pointer-events-none absolute right-2 text-[#747387]"
                      />
                    </label>
                  )}

                  <button
                    type="button"
                    onClick={submit}
                    disabled={!canSubmit}
                    aria-label="Start creating video with AI Director"
                    title="Start (Ctrl/⌘ + Enter)"
                    className="grid h-9 w-9 flex-none place-items-center rounded-[8px] bg-[#5B45F2] text-white transition hover:bg-[#4731D8] disabled:bg-[#F0EFF5] disabled:text-[#868599]"
                  >
                    {sending ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <SendHorizontal size={16} strokeWidth={2.2} aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : large ? (
            <>
              <textarea
                ref={textarea}
                value={value}
                onChange={onText}
                onKeyDown={onKey}
                rows={rows}
                onPaste={(e) => {
                  if (e.clipboardData?.files?.length) {
                    e.preventDefault();
                    add(e.clipboardData.files);
                  }
                }}
                placeholder={placeholder}
                aria-label="Message for Director"
                className="block w-full resize-none bg-transparent px-1.5 py-1 text-[14.5px] leading-[1.65] text-[#14141F] outline-none placeholder:text-[#9A9BAC]"
              />
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1">
                  <label
                    title="Attach images or videos (you can also paste or drag here)"
                    className={`grid h-8 w-8 flex-none cursor-pointer place-items-center rounded-full text-[#6E6F82] transition hover:bg-[#F3F4F8] hover:text-[#14141F] ${
                      !workspaceId || attachments.length >= MAX_ATTACHMENTS ? 'pointer-events-none opacity-40' : ''
                    }`}
                  >
                    <Plus size={17} strokeWidth={2} aria-hidden="true" />
                    <input
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      hidden
                      onChange={(e) => {
                        add(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <span className="text-[11.5px] text-[#9A9BAC]">Ctrl/⌘ + Enter to send</span>
                </div>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit}
                  aria-label="Send message"
                  className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[#5B45F2] text-white shadow-[0_2px_8px_rgba(91,69,242,0.26)] transition hover:bg-[#4731D8] disabled:bg-[#F0EFF5] disabled:text-[#868599] disabled:shadow-none"
                >
                  {sending ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <SendHorizontal size={15} strokeWidth={2.2} aria-hidden="true" />
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-none items-center gap-0.5 pb-0.5">
                <label
                  title="Attach images or videos (you can also paste or drag here)"
                  className={`grid h-8 w-8 flex-none cursor-pointer place-items-center rounded-full text-[#6E6F82] transition hover:bg-[#F3F4F8] hover:text-[#14141F] ${
                    !workspaceId || attachments.length >= MAX_ATTACHMENTS ? 'pointer-events-none opacity-40' : ''
                  }`}
                >
                  <Plus size={17} strokeWidth={2} aria-hidden="true" />
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    hidden
                    onChange={(e) => {
                      add(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
                {board && (
                  <button
                    type="button"
                    title="Mention a shot or asset (@)"
                    onClick={() => {
                      onChange(`${value}${value && !value.endsWith(' ') ? ' ' : ''}@`);
                      setQuery({ start: value.length + (value && !value.endsWith(' ') ? 1 : 0), text: '' });
                      textarea.current?.focus();
                    }}
                    className="grid h-8 w-8 flex-none place-items-center rounded-full text-[#6E6F82] transition hover:bg-[#F3F4F8] hover:text-[#14141F]"
                  >
                    <AtSign size={15} strokeWidth={2} aria-hidden="true" />
                  </button>
                )}
              </div>

              <textarea
                ref={textarea}
                value={value}
                onChange={onText}
                onKeyDown={onKey}
                rows={rows}
                onPaste={(e) => {
                  if (e.clipboardData?.files?.length) {
                    e.preventDefault();
                    add(e.clipboardData.files);
                  }
                }}
                placeholder={placeholder}
                aria-label="Message for Director"
                className="block max-h-40 min-h-[26px] flex-1 resize-none bg-transparent py-1.5 text-[14px] leading-[1.55] text-[#14141F] outline-none placeholder:text-[#9A9BAC]"
              />

              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                aria-label="Send message"
                className="mb-0.5 grid h-8 w-8 flex-none place-items-center rounded-full bg-[#5B45F2] text-white shadow-[0_2px_8px_rgba(91,69,242,0.25)] transition hover:bg-[#4731D8] disabled:bg-[#F0EFF5] disabled:text-[#868599] disabled:shadow-none"
              >
                {sending ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <SendHorizontal size={15} strokeWidth={2.2} aria-hidden="true" />
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {showMetaBar && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-2 text-[11.5px] text-[#8A8B9C]">
          <div className="flex flex-wrap items-center gap-2.5">
            {metaLeft}
            {onRunMode && (
              <div className="inline-flex items-center rounded-full bg-[#F4F4F8] p-0.5">
                {RUN_MODES.map(([id, label, hint]) => (
                  <button
                    key={id}
                    type="button"
                    title={hint}
                    onClick={() => onRunMode(id)}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
                      runMode === id
                        ? 'bg-white text-[#14141F] shadow-[0_1px_2px_rgba(20,20,31,0.08)]'
                        : 'text-[#6E6F82] hover:text-[#14141F]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {onLlm && (
              <label title="AI model for Director and attachment analysis" className="relative inline-flex items-center gap-1 text-[#6E6F82] hover:text-[#14141F]">
                <Sparkles size={12} strokeWidth={2} className="pointer-events-none text-[#8A8B9C]" aria-hidden="true" />
                <span className="sr-only">AI Director Model</span>
                <select
                  value={llm || 'seed'}
                  onChange={(e) => onLlm(e.target.value)}
                  title={LLM_MODELS.find(([id]) => id === (llm || 'seed'))?.[2]}
                  className="cursor-pointer appearance-none bg-transparent py-0.5 pr-4 text-[11.5px] font-medium text-inherit outline-none"
                >
                  {LLM_MODELS.map(([id, label]) => (
                    <option key={id} value={id} className="bg-white text-[#14141F]">
                      {label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={12}
                  strokeWidth={2.2}
                  aria-hidden="true"
                  className="pointer-events-none absolute right-0 text-[#8A8B9C]"
                />
              </label>
            )}
            {metaRight}
          </div>
        </div>
      )}
    </div>
  );
}
