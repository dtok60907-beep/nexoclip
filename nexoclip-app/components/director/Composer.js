'use client';

// The chat box: text, images/videos attached to the message (uploaded to the user's workspace), @mentions of
// shots and elements, the run mode (OpenArt's "Guide me" / "Just make it") and the Director's AI model.

import { useEffect, useMemo, useRef, useState } from 'react';
import { groupShots } from './Workspace.js';

const MAX_ATTACHMENTS = 10;

export const RUN_MODES = [
  ['guide', 'Pandu aku', 'Director berhenti di tiap langkah dan minta persetujuanmu (konsep, audio, kredit).'],
  ['auto', 'Langsung jadi', 'Director memutuskan sendiri dan langsung jalan sampai video final, kredit di-approve otomatis.'],
];

// The Director's text model; it also looks at the images and videos attached in the chat.
export const LLM_MODELS = [
  ['seed', 'Seed 2.1', 'Seed 2.1 Turbo (BytePlus): model bawaan, paling hemat kredit.'],
  ['grok', 'Grok 4.5', 'Grok 4.5 (xAI, lewat OpenRouter): Director dan analisis gambar/video lampiran memakai Grok. Kredit chat sekitar 3x Seed.'],
];

async function upload(file, workspaceId) {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch('/api/uploads', { method: 'POST', headers: { 'x-workspace-id': workspaceId }, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) throw new Error(data.error || 'Upload gagal');
  return data.id;
}

function mentionOptions(board) {
  if (!board) return [];
  const { numbered } = groupShots(board);
  return [
    ...numbered.map((n) => ({ type: 'shot', id: n.shot.id, label: n.label, hint: n.shot.title })),
    ...board.elements.map((e) => ({ type: 'element', id: e.id, label: e.name.replace(/\s+/g, ''), hint: e.kind === 'character' ? 'karakter' : e.kind === 'location' ? 'lokasi' : 'properti' })),
  ];
}

export default function Composer({
  value, onChange, onSubmit, disabled, sending, placeholder, workspaceId, board, runMode, onRunMode, llm, onLlm, rows = 2, large = false,
}) {
  const [attachments, setAttachments] = useState([]); // {key, file, preview, kind, name, asset_id?, error?}
  const [mentions, setMentions] = useState([]);
  const [query, setQuery] = useState(null); // {start, text} while typing "@..."
  const [active, setActive] = useState(0);
  const [dragging, setDragging] = useState(false);
  const textarea = useRef(null);
  const options = useMemo(() => mentionOptions(board), [board]);
  const matches = query ? options.filter((o) => `${o.label} ${o.hint}`.toLowerCase().includes(query.text.toLowerCase())).slice(0, 8) : [];

  useEffect(() => () => attachments.forEach((a) => a.preview && URL.revokeObjectURL(a.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (files) => {
    const picked = [...files].filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'))
      .slice(0, MAX_ATTACHMENTS - attachments.length);
    if (!picked.length || !workspaceId) return;
    const items = picked.map((file) => ({
      key: `${file.name}-${file.size}-${Math.random()}`, file, name: file.name,
      kind: file.type.startsWith('video/') ? 'video' : 'image', preview: URL.createObjectURL(file),
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
  const remove = (key) => setAttachments((list) => {
    const gone = list.find((a) => a.key === key);
    if (gone?.preview) URL.revokeObjectURL(gone.preview);
    return list.filter((a) => a.key !== key);
  });

  const uploading = attachments.some((a) => !a.asset_id && !a.error);
  const canSubmit = !disabled && !sending && !uploading && value.trim();
  const submit = async () => {
    if (!canSubmit) return;
    const ok = await onSubmit(value.trim(), {
      attachments: attachments.filter((a) => a.asset_id).map((a) => ({ asset_id: a.asset_id, kind: a.kind, name: a.name.slice(0, 200) })),
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
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => (i + 1) % matches.length); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => (i - 1 + matches.length) % matches.length); return; }
      if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); pick(matches[active]); return; }
      if (event.key === 'Escape') { setQuery(null); return; }
    }
    if (event.key === 'Enter' && (large ? (event.metaKey || event.ctrlKey) : !event.shiftKey)) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div
      onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); } }}
      className={`relative rounded-2xl border bg-[#0b0e13] p-2 focus-within:border-[#d4ff64]/40 ${dragging ? 'border-[#d4ff64]/60' : 'border-white/10'}`}>
      {query && matches.length > 0 && (
        <div className="absolute bottom-full left-2 z-30 mb-1 w-[280px] overflow-hidden rounded-lg border border-white/10 bg-[#11151b] py-1 shadow-xl">
          {matches.map((o, i) => (
            <button key={`${o.type}:${o.id}`} type="button" onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[11.5px] ${i === active ? 'bg-white/[0.08] text-white' : 'text-white/70'}`}>
              <span className="truncate">@{o.label} <span className="text-white/40">{o.type === 'shot' ? `· ${o.hint}` : ''}</span></span>
              <span className="flex-none text-[10px] text-white/35">{o.type === 'shot' ? 'shot' : o.hint}</span>
            </button>
          ))}
        </div>
      )}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5 px-1">
          {attachments.map((a) => (
            <div key={a.key} title={a.error || a.name} className={`relative h-12 w-12 overflow-hidden rounded-md border ${a.error ? 'border-red-400/60' : 'border-white/15'}`}>
              {a.kind === 'video'
                ? <video src={a.preview} muted playsInline className="h-full w-full object-cover" />
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={a.preview} alt={a.name} className="h-full w-full object-cover" />}
              {a.kind === 'video' && <span className="absolute bottom-0 left-0 rounded-tr bg-black/70 px-0.5 text-[8px] text-white">▶</span>}
              {!a.asset_id && !a.error && <span className="absolute inset-0 grid place-items-center bg-black/50 text-[9px] text-white/80">…</span>}
              {a.error && <span className="absolute inset-0 grid place-items-center bg-red-900/60 text-[9px] text-white">gagal</span>}
              <button type="button" onClick={() => remove(a.key)} aria-label={`Hapus ${a.name}`}
                className="absolute right-0 top-0 grid h-4 w-4 place-items-center rounded-bl bg-black/80 text-[10px] text-white">×</button>
            </div>
          ))}
        </div>
      )}
      <textarea ref={textarea} value={value} onChange={onText} onKeyDown={onKey} rows={rows}
        onPaste={(e) => { if (e.clipboardData?.files?.length) { e.preventDefault(); add(e.clipboardData.files); } }}
        placeholder={placeholder} aria-label="Pesan untuk Director"
        className={`block w-full resize-none bg-transparent px-1.5 py-1 text-white outline-none placeholder:text-white/30 ${large ? 'min-h-[96px] text-[13px] leading-relaxed' : 'max-h-40 min-h-[40px] text-[11.5px]'}`} />
      <div className="mt-1.5 flex items-center gap-1.5">
        <label title="Tambah gambar atau video (bisa juga paste / seret ke sini)"
          className={`grid h-7 w-7 flex-none cursor-pointer place-items-center rounded-lg text-white/55 hover:bg-white/[0.07] hover:text-white ${!workspaceId || attachments.length >= MAX_ATTACHMENTS ? 'pointer-events-none opacity-40' : ''}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.4 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
          <input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        </label>
        {board && (
          <button type="button" title="Sebut shot atau aset (@)" onClick={() => { onChange(`${value}${value && !value.endsWith(' ') ? ' ' : ''}@`); setQuery({ start: value.length + (value && !value.endsWith(' ') ? 1 : 0), text: '' }); textarea.current?.focus(); }}
            className="grid h-7 w-7 flex-none place-items-center rounded-lg text-[13px] text-white/55 hover:bg-white/[0.07] hover:text-white">@</button>
        )}
        {onRunMode && (
          <div className="flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
            {RUN_MODES.map(([id, label, hint]) => (
              <button key={id} type="button" title={hint} onClick={() => onRunMode(id)}
                className={`rounded-md px-2 py-0.5 text-[10.5px] ${runMode === id ? 'bg-white/[0.12] text-white' : 'text-white/45 hover:text-white'}`}>{label}</button>
            ))}
          </div>
        )}
        {onLlm && (
          <label title="Model AI untuk Director dan analisis lampiran" className="relative flex items-center">
            <span className="sr-only">Model AI Director</span>
            <select value={llm || 'seed'} onChange={(e) => onLlm(e.target.value)}
              title={LLM_MODELS.find(([id]) => id === (llm || 'seed'))?.[2]}
              className="h-[26px] cursor-pointer appearance-none rounded-lg border border-white/[0.08] bg-white/[0.03] pl-2 pr-6 text-[10.5px] text-white/70 outline-none hover:text-white focus:border-white/20">
              {LLM_MODELS.map(([id, label]) => <option key={id} value={id} className="bg-[#16181d] text-white">{label}</option>)}
            </select>
            <svg className="pointer-events-none absolute right-1.5 text-white/40" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6" /></svg>
          </label>
        )}
        <button type="button" onClick={submit} disabled={!canSubmit} aria-label="Kirim pesan"
          className="ml-auto grid h-8 w-8 flex-none place-items-center rounded-lg bg-[#d4ff64] text-[#10130a] disabled:bg-white/10 disabled:text-white/30">
          {sending ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
        </button>
      </div>
    </div>
  );
}
