'use client';

// The drawn-video studio: a chat with the Motion Director (like the AI Director). The user describes what they
// want; the AI proposes the kind, style, pace, voice and ideas, writes the script, finds pictures, and asks for
// approval before the paid production (narration, music, drawings). The preview plays in a sandboxed frame
// (/motion-player) because every scene is drawing code an AI wrote.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { STORY_CAMERAS, cleanStory, drawStyleOf, paceOf, storyVideoProps } from './draw/story';
import { ELEVENLABS_VOICES } from '../../src/services/elevenlabsAudio';
import { FORMATS, FORMAT_IDS, layoutOf } from './draw/layout';
import { lottieUrl, sanitizeLottie } from './lottieLibrary';

const LAST_STORY_KEY = 'nexoclip_motion_story_last';
const NEW_NAME = 'Video gambar';
const EXAMPLES = [
  'Video edukasi tentang Homo sapiens untuk anak SMP, seru dan gampang dipahami',
  'Motivasi lembut buat yang lagi capek kuliah, 30 detik',
  'Promo kopi susu gula aren, diskon 20% akhir pekan ini',
  'Dongeng singkat tentang kancil yang jujur',
];

async function api(path, options = {}) {
  const workspaceId = window.sessionStorage.getItem('nexoclip_workspace_id') || '';
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-workspace-id': workspaceId, ...options.headers },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Permintaan gagal.');
  return data;
}

// The sandboxed player. Audio and pictures are resolved here (the frame has no session or network): a storage
// URL, or the bytes; Noto emoji are fetched from Google's CDN and cleaned.
function StoryPreview({ story, onSceneError, renderRef, seekRef, onRender }) {
  const frame = useRef(null);
  const files = useRef(new Map()); // url → { bytes, type }: fetched once, a copy is sent each time
  if (renderRef) renderRef.current = () => frame.current?.contentWindow?.postMessage({ type: 'nexoclip-render' }, '*');
  if (seekRef) seekRef.current = (seconds) => frame.current?.contentWindow?.postMessage({ type: 'nexoclip-seek', seconds }, '*');
  const [ready, setReady] = useState(false);
  const props = useMemo(() => storyVideoProps(story), [story]);
  useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'nexoclip-player-ready') setReady(true);
      if (event.data?.type === 'nexoclip-player-error') onSceneError?.(event.data.scene, event.data.message);
      if (String(event.data?.type).startsWith('nexoclip-render-')) onRender?.(event.data);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onSceneError, onRender]);
  useEffect(() => {
    if (!ready || !frame.current) return undefined;
    let live = true;
    // The frame may only read this app's files, so every file goes in as bytes (streamed through the app).
    const resolve = async (url) => {
      if (!url) return null;
      try {
        let file = files.current.get(url);
        if (!file) {
          const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}stream=1`, { credentials: 'include' });
          if (!response.ok) return null;
          file = { bytes: await response.arrayBuffer(), type: response.headers.get('content-type') || 'application/octet-stream' };
          files.current.set(url, file);
        }
        return { bytes: file.bytes.slice(0), type: file.type };
      } catch {
        return null;
      }
    };
    (async () => {
      const entries = Object.entries(props.assets || {});
      const [voice, music, ...resolved] = await Promise.all([
        resolve(props.voice), resolve(props.music),
        ...entries.map(async ([key, asset]) => {
          if (asset.type === 'lottie' && asset.source === 'noto') {
            try { return [key, { type: 'lottie', data: sanitizeLottie(await (await fetch(lottieUrl(key))).json()) }]; } catch { return [key, null]; }
          }
          if (asset.type === 'image') return [key, { type: 'image', file: await resolve(asset.url) }];
          return [key, null];
        }),
      ]);
      if (!live) return;
      const assets = Object.fromEntries(resolved.filter(([, a]) => a && (a.data || a.file)));
      const transfer = [voice?.bytes, music?.bytes, ...Object.values(assets).map((a) => a.file?.bytes)].filter(Boolean);
      frame.current?.contentWindow?.postMessage({ type: 'nexoclip-story', props: { ...props, voice: null, music: null, assets: null }, audio: { voice, music }, assets }, '*', transfer);
    })();
    return () => { live = false; };
  }, [ready, props]);
  return <iframe ref={frame} src="/motion-player" title="Pratinjau video" sandbox="allow-scripts" className="h-full w-full rounded-2xl border-0 bg-[#0b0b0f]" />;
}

// The AI writes light markdown (**bold**, "- " and "1. " lists, ## headings); show it as text, not as stars.
function Rich({ text }) {
  const inline = (line, key) => line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (
    /^\*\*[^*]+\*\*$/.test(part) ? <strong key={`${key}-${i}`} className="font-semibold">{part.slice(2, -2)}</strong> : part.replace(/\*\*/g, '')
  ));
  return String(text || '').split('\n').map((raw, i) => {
    const line = raw.replace(/^#{1,6}\s+/, '');
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (bullet) return <div key={i} className="flex gap-2 pl-1"><span className="text-white/40">•</span><span>{inline(bullet[1], i)}</span></div>;
    if (numbered) return <div key={i} className="flex gap-2 pl-1"><span className="text-white/40">{numbered[1]}.</span><span>{inline(numbered[2], i)}</span></div>;
    if (!line.trim()) return <div key={i} className="h-2" />;
    return <div key={i}>{inline(line, i)}</div>;
  });
}


const CAMERA_LABELS = { push: 'Mendekat', pull: 'Mundur', 'pan-left': 'Geser kiri', 'pan-right': 'Geser kanan', 'tilt-up': 'Naik', 'tilt-down': 'Turun', roll: 'Miring', orbit: 'Mengayun', crash: 'Hentak', handheld: 'Goyang tangan', shake: 'Guncang' };
const voiceName = (id) => ELEVENLABS_VOICES.find((v) => v.id === id)?.name || ELEVENLABS_VOICES[0].name;
const narration = (story) => story.scenes.map((scene) => (scene.say || scene.text)).join(' ');
const themesOf = (story) => [...new Set([...Object.keys(story.background || {}).filter((k) => story.background[k]?.top || story.background[k]?.image), 'paper', 'dusk', 'night'])];
const sceneStatus = (scene, busy, error) => (error || scene.codeError ? 'gagal' : !scene.code ? (busy ? 'menunggu' : 'belum') : scene.redraw ? 'ulang' : 'jadi');
const STATUS = {
  jadi: { label: 'jadi', dot: 'bg-[#d4ff64]' }, ulang: { label: 'akan digambar ulang', dot: 'bg-amber-300' },
  belum: { label: 'belum digambar', dot: 'bg-white/25' }, menunggu: { label: 'menunggu gambar', dot: 'animate-pulse bg-white/50' }, gagal: { label: 'gagal digambar', dot: 'bg-red-400' },
};

// Width that the user can drag (kept per browser).
function useResizable(key, initial, min, max) {
  const [width, setWidth] = useState(initial);
  useEffect(() => { try { const w = Number(window.localStorage.getItem(key)); if (w >= min && w <= max) setWidth(w); } catch { /* storage unavailable */ } }, [key, min, max]);
  const start = (event, side = 1) => {
    event.preventDefault();
    const x0 = event.clientX, w0 = width;
    const move = (e) => setWidth(Math.min(max, Math.max(min, w0 + (e.clientX - x0) * side)));
    const up = (e) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try { window.localStorage.setItem(key, String(Math.min(max, Math.max(min, w0 + (e.clientX - x0) * side)))); } catch { /* storage unavailable */ }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return [width, start];
}

function Handle({ onPointerDown }) {
  return <div role="separator" aria-orientation="vertical" onPointerDown={onPointerDown} className="hidden w-1.5 flex-none cursor-col-resize rounded-full transition-colors hover:bg-[#d4ff64]/30 lg:block" />;
}

function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40">{label}{hint ? <span className="ml-1 font-normal normal-case tracking-normal text-white/25">{hint}</span> : null}</span>
      {children}
    </label>
  );
}
const inputClass = 'w-full rounded-lg border border-white/[0.08] bg-[#121411] px-2.5 py-2 text-[13px] text-[#f2eee5] outline-none transition focus:border-[#d4ff64]/60 disabled:opacity-60';

function Message({ message, onPick, onOpen, busy }) {
  const mine = message.role === 'user';
  return (
    <div className={`flex flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
      <div className={`max-w-[94%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${mine ? 'whitespace-pre-line rounded-br-md bg-[#d4ff64] text-black' : message.error ? 'bg-red-500/10 text-red-200 ring-1 ring-red-500/20' : 'rounded-bl-md bg-white/[0.045] text-[#f2eee5] ring-1 ring-white/[0.06]'}`}>
        {mine ? message.content : <Rich text={message.content} />}
        {message.credits > 0 && <span className="mt-1.5 block text-[10.5px] text-white/35">{message.credits} kredit</span>}
      </div>
      {message.cards?.map((card, i) => (
        <button key={i} type="button" onClick={() => onOpen(card)} className="flex w-[94%] items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 text-left ring-1 ring-white/[0.07] transition hover:bg-white/[0.07]">
          <span className="min-w-0">
            <span className="block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#d4ff64]/70">{{ brief: 'Brief', script: 'Naskah', scene: `Adegan ${Number(card.scene) + 1}`, plan: 'Rencana produksi' }[card.kind]}</span>
            <span className="block truncate text-[13px] text-[#f2eee5]">{card.title || 'Lihat detail'}</span>
          </span>
          <span className="shrink-0 rounded-lg bg-white/[0.07] px-2.5 py-1 text-[11.5px] font-semibold text-white/75">Lihat</span>
        </button>
      ))}
      {message.ideas?.length > 0 && (
        <div className="flex w-[94%] flex-col gap-1.5">
          {message.ideas.map((idea, i) => (
            <button key={i} type="button" disabled={busy} onClick={() => onPick(i, idea)}
              className="flex flex-col gap-0.5 rounded-xl bg-white/[0.03] p-3 text-left ring-1 ring-white/[0.07] transition hover:bg-white/[0.07] disabled:opacity-50">
              <span className="text-[13px] font-semibold text-[#f2eee5]">{i + 1}. {idea.title}</span>
              <span className="text-[12.5px] italic text-white/65">“{idea.hook}”</span>
              <span className="text-[11.5px] text-white/40">{idea.angle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// A compact plan notice in the chat: the full plan opens in the side panel.
function PlanNotice({ story, onOpen, onApprove, disabled }) {
  const p = story.pending;
  if (!p) return null;
  const parts = [p.what.includes('voice') && 'suara narator', p.what.includes('music') && 'musik', p.scenes?.length && `${p.scenes.length} adegan`].filter(Boolean).join(' · ');
  return (
    <div className="flex w-[94%] flex-col gap-2 rounded-xl bg-[#d4ff64]/[0.06] p-3 ring-1 ring-[#d4ff64]/25">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-[#f2eee5]">Rencana produksi siap</span>
        <span className="text-[11.5px] text-white/50">±{p.credits} kredit</span>
      </div>
      <span className="text-[12px] text-white/55">{parts}</span>
      <div className="flex gap-2">
        <button type="button" onClick={() => onOpen({ kind: 'plan' })} className="flex-1 rounded-lg bg-white/[0.07] py-2 text-[12.5px] font-semibold text-white/80 hover:bg-white/[0.12]">Lihat rencana</button>
        <button type="button" disabled={disabled} onClick={onApprove} className="flex-1 rounded-lg bg-[#d4ff64] py-2 text-[12.5px] font-bold text-black disabled:opacity-40">Buat</button>
      </div>
    </div>
  );
}

function SceneDetail({ story, index }) {
  const scene = story.scenes[index];
  if (!scene) return <p className="text-white/40">Adegan ini sudah tidak ada.</p>;
  const cast = story.cast.filter((c) => scene.visual.toLowerCase().includes(c.name.toLowerCase()));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5 text-[11px] text-white/55">
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5">{scene.duration.toFixed(1)} dtk</span>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5">kamera: {CAMERA_LABELS[scene.camera] || scene.camera}</span>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5">latar: {scene.theme}</span>
        {scene.emphasis && <span className="rounded-full bg-white/[0.06] px-2 py-0.5">tekanan: {scene.emphasis}</span>}
      </div>
      <section><h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">Teks di layar</h4><p className="text-[14px] text-[#f2eee5]">{scene.text}</p></section>
      <section><h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">Dibacakan narator</h4><p className="text-[13px] text-white/75">{scene.say || scene.text}</p></section>
      <section><h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">Gambar & gerak</h4><p className="text-[13px] leading-relaxed text-white/75">{scene.visual}</p></section>
      {cast.length > 0 && <section><h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">Tokoh</h4>{cast.map((c) => <p key={c.name} className="text-[12.5px] text-white/65"><b className="text-white/80">{c.name}</b>: {c.look}</p>)}</section>}
    </div>
  );
}

// The side panel opened from a card: the brief, the whole script, one scene, or the production plan.
function DetailPanel({ card, story, onClose, onApprove, busy }) {
  if (!card) return null;
  const style = drawStyleOf(story.styleSpec || story.style);
  const pace = paceOf(story.paceSpec || story.pace);
  const seconds = Math.round(story.scenes.reduce((sum, s) => sum + s.duration, 0));
  const p = story.pending;
  const title = { brief: 'Brief', script: `Naskah · ${story.scenes.length} adegan`, scene: `Adegan ${Number(card.scene) + 1}`, plan: 'Rencana produksi' }[card.kind];
  const Row = ({ k, v }) => (v ? <div className="grid grid-cols-[96px_1fr] gap-3 border-b border-white/[0.05] py-2 text-[12.5px]"><span className="text-white/40">{k}</span><span className="text-white/80">{v}</span></div> : null);
  return (
    <div className="absolute inset-0 z-30 flex flex-col overflow-hidden rounded-2xl bg-[#0f110e] ring-1 ring-white/[0.08]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <span className="text-[14px] font-semibold text-[#f2eee5]">{title}</span>
        <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-[12px] text-white/55 hover:bg-white/[0.06] hover:text-white">Tutup</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {(card.kind === 'brief' || card.kind === 'plan') && (
          <div className="mb-3">
            <Row k="Judul" v={story.title} />
            <Row k="Brief" v={story.brief} />
            <Row k="Jenis" v={story.kind} />
            <Row k="Gaya" v={`${style.label} — ${style.look}`} />
            <Row k="Tempo" v={`${pace.label} — ${pace.tone}`} />
            <Row k="Durasi" v={story.scenes.length ? `±${seconds} detik · ${story.scenes.length} adegan` : ''} />
            <Row k="Narator" v={`${voiceName(story.voiceId)}`} />
            <Row k="Musik" v={story.music ? (story.musicPrompt || pace.music) : 'tanpa musik'} />
            <Row k="Tokoh" v={story.cast.map((c) => `${c.name}: ${c.look}`).join(' · ')} />
          </div>
        )}
        {card.kind === 'plan' && p && (
          <div className="mb-3 rounded-xl bg-[#d4ff64]/[0.06] p-3 ring-1 ring-[#d4ff64]/20">
            <div className="mb-1 text-[12px] font-semibold text-[#f2eee5]">Yang akan dibuat</div>
            <div className="grid grid-cols-2 gap-1 text-[12px] text-white/70">
              {p.what.includes('voice') && <><span>Suara narator</span><span className="text-right">±{p.breakdown?.voice ?? '?'} kredit</span></>}
              {p.what.includes('music') && <><span>Musik</span><span className="text-right">±{p.breakdown?.music ?? '?'} kredit</span></>}
              {p.scenes?.length > 0 && <><span>Gambar {p.scenes.length} adegan</span><span className="text-right">±{p.breakdown?.draw ?? '?'} kredit</span></>}
              <span className="font-semibold text-white/90">Total</span><span className="text-right font-semibold text-white/90">±{p.credits} kredit</span>
            </div>
          </div>
        )}
        {card.kind === 'scene' && <SceneDetail story={story} index={Number(card.scene)} />}
        {(card.kind === 'script' || card.kind === 'plan') && (
          <ol className="flex flex-col gap-2">
            {story.scenes.map((scene, i) => {
              const drawn = card.kind === 'plan' && p?.scenes?.includes(i);
              return (
                <li key={i} className={`rounded-xl px-3 py-2.5 ring-1 ring-white/[0.06] ${card.kind === 'plan' && !drawn ? 'bg-white/[0.015] opacity-60' : 'bg-white/[0.035]'}`}>
                  <div className="mb-1 flex items-center justify-between text-[10.5px] text-white/40"><span className="font-mono">#{i + 1} · {scene.duration.toFixed(1)} dtk</span>{card.kind === 'plan' && <span>{drawn ? 'digambar' : 'tetap'}</span>}</div>
                  <p className="text-[13px] text-[#f2eee5]">🎙 {scene.say || scene.text}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-white/50">🖼 {scene.visual}</p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {card.kind === 'plan' && p && (
        <div className="border-t border-white/[0.06] p-3">
          <button type="button" disabled={busy} onClick={onApprove} className="w-full rounded-xl bg-[#d4ff64] py-2.5 text-[14px] font-bold text-black disabled:opacity-40">Buat (±{p.credits} kredit)</button>
        </div>
      )}
    </div>
  );
}

// The scene editor on the right: a compact list and the selected scene's form.
function ScenesEditor({ story, selected, onSelect, onChange, disabled, sceneErrors, busy, onAskAI }) {
  const themes = themesOf(story);
  const scene = story.scenes[selected];
  const update = (patch, redraw = true) => onChange(story.scenes.map((s, k) => (k === selected ? { ...s, ...patch, ...(redraw ? { redraw: true } : {}) } : s)));
  const move = (d) => { const list = [...story.scenes]; const [x] = list.splice(selected, 1); list.splice(selected + d, 0, x); onChange(list); onSelect(selected + d); };
  const remove = () => { onChange(story.scenes.filter((_, k) => k !== selected)); onSelect(Math.max(0, selected - 1)); };
  const add = () => { const list = [...story.scenes]; list.splice(selected + 1, 0, { text: 'Teks narasi baru.', say: '', visual: 'Jelaskan gambarnya.', theme: themes[0], camera: 'push', emphasis: '', duration: 3, words: [], code: '', redraw: true }); onChange(list); onSelect(selected + 1); };
  if (!story.scenes.length) return <p className="p-3 text-[12.5px] text-white/40">Belum ada naskah. Minta AI di chat, misalnya "tulis naskahnya".</p>;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ol className="flex max-h-[38%] min-h-[120px] flex-col overflow-y-auto rounded-xl ring-1 ring-white/[0.06]">
        {story.scenes.map((s, i) => {
          const st = STATUS[sceneStatus(s, busy, sceneErrors[i])];
          return (
            <li key={i}>
              <button type="button" onClick={() => onSelect(i)} className={`flex w-full items-center gap-2.5 border-b border-white/[0.04] px-3 py-2 text-left text-[12.5px] transition ${i === selected ? 'bg-white/[0.07] text-white' : 'text-white/70 hover:bg-white/[0.03]'}`}>
                <span className="w-5 font-mono text-[11px] text-white/35">{i + 1}</span>
                <span className={`h-2 w-2 flex-none rounded-full ${st.dot}`} title={st.label} />
                <span className="min-w-0 flex-1 truncate">{s.text}</span>
                <span className="font-mono text-[10.5px] text-white/30">{s.duration.toFixed(1)}s</span>
              </button>
            </li>
          );
        })}
      </ol>
      {scene && (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#f2eee5]">Adegan {selected + 1}</span>
            <span className="text-[11px] text-white/40">{STATUS[sceneStatus(scene, busy, sceneErrors[selected])].label}</span>
          </div>
          {(scene.codeError || sceneErrors[selected]) && <p className="rounded-lg bg-amber-400/10 px-2.5 py-1.5 text-[11.5px] text-amber-200/80">{scene.codeError || sceneErrors[selected]}</p>}
          <Field label="Teks di layar"><textarea rows={2} value={scene.text} disabled={disabled} onChange={(e) => update({ text: e.target.value })} className={inputClass} /></Field>
          <Field label="Dibacakan narator" hint="kata sama; boleh [tag], KAPITAL, ..."><textarea rows={2} value={scene.say} disabled={disabled} onChange={(e) => update({ say: e.target.value }, false)} className={inputClass} /></Field>
          <Field label="Gambar & gerak"><textarea rows={4} value={scene.visual} disabled={disabled} onChange={(e) => update({ visual: e.target.value })} className={inputClass} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Kamera"><select value={scene.camera} disabled={disabled} onChange={(e) => update({ camera: e.target.value }, false)} className={inputClass}>{STORY_CAMERAS.map((c) => <option key={c} value={c}>{CAMERA_LABELS[c] || c}</option>)}</select></Field>
            <Field label="Latar"><select value={scene.theme} disabled={disabled} onChange={(e) => update({ theme: e.target.value })} className={inputClass}>{themes.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
          </div>
          <Field label="Kata penekanan"><input value={scene.emphasis} disabled={disabled} onChange={(e) => update({ emphasis: e.target.value }, false)} className={inputClass} /></Field>
          <div className="flex flex-wrap gap-1.5 pt-1 text-[11.5px]">
            <button type="button" disabled={disabled} onClick={() => onAskAI(selected)} className="rounded-lg bg-[#d4ff64]/15 px-2.5 py-1.5 font-semibold text-[#d4ff64]">Minta AI ubah</button>
            <button type="button" disabled={disabled} onClick={() => update({})} className="rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-white/70">Gambar ulang</button>
            <button type="button" disabled={disabled || selected === 0} onClick={() => move(-1)} className="rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-white/70 disabled:opacity-30">↑</button>
            <button type="button" disabled={disabled || selected === story.scenes.length - 1} onClick={() => move(1)} className="rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-white/70 disabled:opacity-30">↓</button>
            <button type="button" disabled={disabled} onClick={add} className="rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-white/70">+ Adegan</button>
            <button type="button" disabled={disabled || story.scenes.length < 3} onClick={remove} className="rounded-lg bg-red-500/10 px-2.5 py-1.5 text-red-300 disabled:opacity-30">Hapus</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AudioEditor({ story, onChange, disabled }) {
  const recorded = story.voice && story.voiceText === narration(story) && (!story.voiceFor || story.voiceFor === (story.voiceId || story.voiceFor));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
      <Field label="Suara narator">
        <select value={story.voiceId || ELEVENLABS_VOICES[0].id} disabled={disabled} onChange={(e) => onChange({ voiceId: e.target.value })} className={inputClass}>
          {ELEVENLABS_VOICES.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.gender === 'male' ? 'pria' : 'wanita'} · {v.description}</option>)}
        </select>
      </Field>
      <div className="rounded-xl bg-white/[0.025] ring-1 ring-white/[0.06]">
        <div className="flex items-center justify-between border-b border-white/[0.05] px-3 py-2 text-[11px]"><span className="font-semibold uppercase tracking-[0.08em] text-white/40">Naskah voiceover</span><span className={recorded ? 'text-[#d4ff64]/70' : 'text-white/40'}>{story.voice ? (recorded ? 'sudah direkam' : 'perlu direkam ulang') : 'belum direkam'}</span></div>
        <ol className="flex flex-col px-3 py-2 text-[12.5px] leading-relaxed text-white/70">
          {story.scenes.length ? story.scenes.map((s, i) => <li key={i} className="flex gap-2 py-0.5"><span className="w-5 font-mono text-[11px] text-white/30">{i + 1}</span><span>{s.say || s.text}</span></li>) : <li className="text-white/40">Belum ada naskah.</li>}
        </ol>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-white/75"><input type="checkbox" checked={story.music} disabled={disabled} onChange={(e) => onChange({ music: e.target.checked })} /> Musik latar</label>
      {story.music && <Field label="Prompt musik" hint="genre, suasana, instrumen, BPM, era"><textarea rows={4} value={story.musicPrompt} disabled={disabled} onChange={(e) => onChange({ musicPrompt: e.target.value })} className={inputClass} /></Field>}
      {story.musicTrack && <p className="text-[11px] text-white/40">{story.musicFor === story.musicPrompt ? 'Musik sudah dibuat dari prompt ini.' : 'Prompt berubah: musik akan dibuat ulang.'}</p>}
      {Object.keys(story.assets || {}).length > 0 && (
        <div className="rounded-xl bg-white/[0.025] p-3 ring-1 ring-white/[0.06]">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40">Gambar & animasi dari luar</div>
          {Object.entries(story.assets).map(([key, a]) => <p key={key} className="text-[11.5px] text-white/55"><span className="font-mono text-[#d4ff64]/70">{key}</span> {a.credit ? `· ${a.credit}` : ''}</p>)}
        </div>
      )}
    </div>
  );
}

// Scenes as blocks along time: click to jump there and edit it; the actions act on that scene.
function Timeline({ story, selected, onSelect, busy, sceneErrors }) {
  const total = story.scenes.reduce((sum, s) => sum + s.duration, 0) || 1;
  if (!story.scenes.length) return null;
  return (
    <div className="flex h-12 w-full gap-1 overflow-x-auto">
      {story.scenes.map((s, i) => {
        const st = STATUS[sceneStatus(s, busy, sceneErrors[i])];
        return (
          <button key={i} type="button" onClick={() => onSelect(i)} title={`${i + 1}. ${s.text}`} style={{ flexGrow: s.duration, flexBasis: 0, minWidth: 44 }}
            className={`relative flex flex-col justify-between overflow-hidden rounded-lg px-2 py-1 text-left ring-1 transition ${i === selected ? 'bg-white/[0.12] ring-[#d4ff64]/60' : 'bg-white/[0.04] ring-white/[0.06] hover:bg-white/[0.08]'}`}>
            <span className="flex items-center gap-1.5 text-[10.5px] text-white/60"><span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} /><span className="font-mono">{i + 1}</span></span>
            <span className="truncate text-[10px] text-white/40">{s.text}</span>
          </button>
        );
      })}
      <span className="sr-only">{Math.round(total)} detik</span>
    </div>
  );
}

export default function StoryStudio({ authenticated = false, beforeGenerate = () => true, onCreditsUsed }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [story, setStory] = useState(() => cleanStory({}));
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [tab, setTab] = useState('scenes');
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState(0);
  const [card, setCard] = useState(null);
  const [sceneErrors, setSceneErrors] = useState({});
  const [render, setRender] = useState(null); // { progress } while rendering, { url } when done, { error }
  const [atBottom, setAtBottom] = useState(true);
  const [chatWidth, dragChat] = useResizable('nexoclip_motion_chat_w', 400, 300, 640);
  const [sideWidth, dragSide] = useResizable('nexoclip_motion_side_w', 380, 300, 560);
  const renderRef = useRef(null);
  const seekRef = useRef(null);
  const jobRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const busy = Boolean(job && (job.status === 'queued' || job.status === 'running'));
  const streaming = busy && String(job?.progress || '').startsWith('§') ? job.progress.slice(1) : '';

  const openProject = useCallback(async (id) => {
    const { project, job: active } = await api(`/api/motion/projects/${id}`);
    setProjectId(id);
    setStory(cleanStory(project.doc?.story));
    setSceneErrors({});
    setSelected(0);
    setCard(null);
    setRender(null);
    try { window.localStorage.setItem(LAST_STORY_KEY, id); } catch { /* storage unavailable */ }
    if (active) { jobRef.current = active; setJob(active); }
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    (async () => {
      try {
        const { projects: all } = await api('/api/motion/projects');
        const list = all.filter((p) => p.kind === 'story');
        setProjects(list);
        let last = null;
        try { last = window.localStorage.getItem(LAST_STORY_KEY); } catch { /* storage unavailable */ }
        const id = (last && list.some((p) => p.id === last) && last) || list[0]?.id;
        if (id) await openProject(id);
      } catch (err) { setError(err.message); }
    })();
  }, [authenticated, openProject]);

  // Chat scrolling like the AI Director: stay at the newest message unless the user scrolled up.
  const onScroll = () => {
    const el = listRef.current;
    if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };
  const toBottom = (behavior = 'smooth') => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior });
  useLayoutEffect(() => { if (atBottom) toBottom('auto'); }, [story.chat.length, streaming, busy, story.pending]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the running job: a streamed reply shows live, drawn scenes appear as they land.
  useEffect(() => {
    if (!busy) return undefined;
    let live = true;
    let timer;
    let lastRefresh = 0;
    const tick = async () => {
      try {
        const { job: now } = await api(`/api/motion/jobs/${jobRef.current.id}`);
        if (!live) return;
        setJob(now);
        if (now.status === 'done' || now.status === 'failed') {
          if (projectId) await openProject(projectId).catch(() => {});
          if (projectId) api('/api/motion/projects').then(({ projects: all }) => setProjects(all.filter((p) => p.kind === 'story'))).catch(() => {});
          if (now.credits > 0) onCreditsUsed?.();
          return;
        }
        if (projectId && /menggambar|suara|musik/i.test(now.progress || '') && Date.now() - lastRefresh > 2500) {
          lastRefresh = Date.now();
          const { project } = await api(`/api/motion/projects/${projectId}`);
          if (live) setStory(cleanStory(project.doc?.story));
        }
      } catch { /* next tick */ }
      if (live) timer = setTimeout(tick, String(jobRef.current?.progress || '').startsWith('§') ? 500 : 900);
    };
    timer = setTimeout(tick, 600);
    return () => { live = false; clearTimeout(timer); };
  }, [busy, projectId, openProject, onCreditsUsed]);

  const ensureProject = async (name) => {
    if (projectId) return projectId;
    const { project } = await api('/api/motion/projects', { method: 'POST', body: JSON.stringify({ name: name.slice(0, 60) || NEW_NAME, doc: { kind: 'story', story: cleanStory({}) } }) });
    setProjects((list) => [project, ...list]);
    setProjectId(project.id);
    try { window.localStorage.setItem(LAST_STORY_KEY, project.id); } catch { /* storage unavailable */ }
    return project.id;
  };

  const run = async (input, optimistic) => {
    if (!beforeGenerate()) return;
    setError('');
    try {
      const id = await ensureProject(input.message || NEW_NAME);
      if (optimistic) setStory((s) => ({ ...s, chat: [...s.chat, { role: 'user', content: optimistic }] }));
      setAtBottom(true);
      const { job: queued } = await api('/api/motion/story', { method: 'POST', body: JSON.stringify({ projectId: id, ...input }) });
      jobRef.current = queued;
      setJob(queued);
    } catch (err) { setError(err.message); }
  };
  const send = (value = text) => {
    const message = value.trim();
    if (!message || busy) return;
    setText('');
    run({ type: 'story-chat', message }, message);
  };
  const produce = () => { setCard(null); run({ type: 'story-produce' }); };
  const newStory = () => { setProjectId(null); setStory(cleanStory({})); setJob(null); setError(''); setSceneErrors({}); setSelected(0); setCard(null); setRender(null); };
  // Hand edits stay in the page until saved; the old plan no longer applies.
  const edit = (patch) => { setStory((s) => ({ ...s, ...patch, pending: null })); setDirty(true); };
  const saveAndPlan = async () => {
    if (!projectId) return;
    setError('');
    try {
      await api(`/api/motion/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify({ doc: { kind: 'story', story } }) });
      setDirty(false);
      const { pending } = await api('/api/motion/story', { method: 'POST', body: JSON.stringify({ projectId, type: 'story-plan' }) });
      setStory((s) => ({ ...s, pending }));
      if (pending) setCard({ kind: 'plan' }); else setError('Tidak ada yang perlu dibuat ulang.');
    } catch (err) { setError(err.message); }
  };
  const selectScene = (i) => {
    setSelected(i);
    setTab('scenes');
    const start = story.scenes.slice(0, i).reduce((sum, s) => sum + s.duration, 0);
    seekRef.current?.(start + 0.05);
  };
  const askAI = (i) => { setText(`Adegan ${i + 1}: `); inputRef.current?.focus(); };
  const onRender = useCallback((data) => {
    if (data.type === 'nexoclip-render-progress') setRender({ progress: data.progress });
    if (data.type === 'nexoclip-render-failed') setRender({ error: data.message });
    if (data.type === 'nexoclip-render-done') setRender({ url: URL.createObjectURL(new Blob([data.bytes], { type: 'video/mp4' })) });
  }, []);
  const startRender = () => { setRender({ progress: 0 }); renderRef.current?.(); };
  const onSceneError = useCallback((scene, message) => setSceneErrors((e) => (e[scene] ? e : { ...e, [scene]: message })), []);

  const totalSeconds = Math.round(story.scenes.reduce((sum, scene) => sum + scene.duration, 0));
  const hasVideo = story.scenes.some((scene) => scene.code);
  const progressLine = busy && !streaming ? (job.progress || 'Menunggu giliran…') : '';

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3 lg:flex-row lg:gap-1.5 lg:overflow-hidden">
      {/* Chat */}
      <aside className="relative flex shrink-0 flex-col gap-2.5 lg:min-h-0 lg:w-[var(--chat-w)]" style={{ '--chat-w': `${chatWidth}px` }}>
        {authenticated && (
          <div className="flex items-center gap-2">
            <select value={projectId || ''} disabled={busy} onChange={(e) => (e.target.value ? openProject(e.target.value).catch((err) => setError(err.message)) : newStory())}
              className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-[#161915] px-3 py-2 text-[13px] outline-none">
              <option value="">+ Video baru</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.firstTitle || p.name}</option>)}
            </select>
            <button type="button" onClick={newStory} disabled={busy} className="rounded-xl bg-white/[0.05] px-3 py-2 text-[12px] font-semibold text-white/70 ring-1 ring-white/[0.08] hover:text-white">Baru</button>
          </div>
        )}
        <div className="relative min-h-[320px] flex-1 lg:min-h-0">
          <div ref={listRef} onScroll={onScroll} className="absolute inset-0 flex flex-col gap-3 overflow-y-auto overscroll-contain pb-4 pr-1.5 [scrollbar-width:thin]">
            {!story.chat.length && (
              <div className="flex flex-col gap-3 rounded-2xl bg-gradient-to-br from-[#d4ff64]/[0.09] to-transparent p-4 ring-1 ring-[#d4ff64]/15">
                <span className="text-[13px] font-bold text-[#d4ff64]">Motion Director</span>
                <p className="text-[13px] leading-relaxed text-white/65">Ceritakan video yang kamu mau: topiknya, untuk siapa, nadanya. AI mengusulkan gaya, tempo, suara, dan ide, lalu menulis naskah dan menggambarnya. Semua bisa diubah lewat chat atau langsung di panel kanan.</p>
                <div className="flex flex-col gap-1.5">
                  {EXAMPLES.map((example) => (
                    <button key={example} type="button" onClick={() => send(example)} disabled={busy}
                      className="rounded-xl bg-white/[0.04] px-3 py-2 text-left text-[12px] text-white/70 ring-1 ring-white/[0.06] hover:bg-white/[0.08] hover:text-white">{example}</button>
                  ))}
                </div>
              </div>
            )}
            {story.chat.map((message, i) => (
              <Message key={i} message={message} busy={busy} onOpen={setCard} onPick={(n, idea) => send(`Pakai ide ${n + 1}: ${idea.title}`)} />
            ))}
            {streaming && <div className="flex flex-col items-start"><div className="max-w-[94%] rounded-2xl rounded-bl-md bg-white/[0.045] px-3.5 py-2.5 text-[13.5px] leading-relaxed text-[#f2eee5] ring-1 ring-white/[0.06]"><Rich text={streaming} /><span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-[#d4ff64]/70 align-middle" /></div></div>}
            {!busy && !dirty && <PlanNotice story={story} onOpen={setCard} onApprove={produce} disabled={busy} />}
            {progressLine && <p className="flex items-center gap-2 text-[12.5px] text-white/55"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d4ff64]" />{progressLine}</p>}
            {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300 ring-1 ring-red-500/20">{error}</p>}
          </div>
          {!atBottom && <button type="button" onClick={() => { toBottom(); setAtBottom(true); }} className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[#1c1f1a] px-3 py-1.5 text-[11.5px] font-semibold text-white/80 shadow-lg ring-1 ring-white/10">↓ Pesan terbaru</button>}
          <DetailPanel card={card} story={story} onClose={() => setCard(null)} onApprove={produce} busy={busy} />
        </div>
        {dirty && <p className="text-[11px] text-amber-200/70">Ada editan (panel kanan atau rasio) yang belum disimpan. Simpan dulu sebelum minta AI.</p>}
        <div className="flex items-end gap-2 rounded-2xl bg-white/[0.03] p-2 ring-1 ring-white/[0.07] focus-within:ring-[#d4ff64]/40">
          <textarea ref={inputRef} value={text} onChange={(e) => setText(e.target.value.slice(0, 2000))} rows={2} disabled={busy}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={story.scenes.length ? 'mis. adegan 3 ganti jadi api unggun, narasinya lebih santai' : 'Ceritakan video yang kamu mau…'}
            className="min-w-0 flex-1 resize-none bg-transparent px-1.5 py-1 text-[13.5px] outline-none placeholder:text-white/30" />
          <button type="button" onClick={() => send()} disabled={busy || !text.trim()} className="rounded-xl bg-[#d4ff64] px-4 py-2 text-[13px] font-bold text-black disabled:opacity-40">Kirim</button>
        </div>
      </aside>
      <Handle onPointerDown={(e) => dragChat(e, 1)} />

      {/* Preview and timeline */}
      <section className="flex min-h-[78vh] min-w-0 flex-1 flex-col gap-2.5 lg:min-h-0">
        <div className="flex items-baseline justify-between gap-2 px-1">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Pratinjau · {story.format}{totalSeconds ? ` · ${totalSeconds} dtk` : ''}{story.kind ? ` · ${story.kind}` : ''}</div>
            <div className="truncate font-display text-[19px] font-semibold tracking-tight">{story.title || 'Video gambar'}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <select value={story.format} disabled={busy} title="Rasio video" onChange={(e) => edit({ format: e.target.value, scenes: story.scenes.map((sc) => ({ ...sc, redraw: true })) })}
              className="rounded-lg border border-white/[0.08] bg-[#161915] px-2 py-1 text-[11.5px] text-white/75 outline-none">
              {FORMAT_IDS.map((f) => <option key={f} value={f}>{f} · {FORMATS[f].label}</option>)}
            </select>
            {story.brief && <button type="button" onClick={() => setCard({ kind: 'brief' })} className="rounded-lg bg-white/[0.05] px-2.5 py-1 text-[11.5px] text-white/60 hover:text-white">Brief</button>}
          </div>
        </div>
        <div className="relative mx-auto min-h-[50vh] w-full flex-1 overflow-hidden rounded-3xl bg-[#111310] ring-1 ring-white/[0.05] lg:min-h-0" style={{ maxWidth: { '9:16': 430, '4:5': 520, '1:1': 580, '16:9': 9999 }[story.format] || 430 }}>
          {hasVideo ? <StoryPreview story={story} onSceneError={onSceneError} renderRef={renderRef} seekRef={seekRef} onRender={onRender} /> : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-white/45">
              <p className="font-display text-[17px] text-white/70">{story.scenes.length ? 'Naskah siap. Cek rencana produksinya di chat.' : 'Mulai dari chat'}</p>
              <p className="max-w-xs text-[12.5px]">Pratinjau muncul begitu adegan pertama selesai digambar.</p>
            </div>
          )}
        </div>
        <Timeline story={story} selected={selected} onSelect={selectScene} busy={busy} sceneErrors={sceneErrors} />
        <div className="flex items-center gap-2">
          {render?.url ? (
            <a href={render.url} download={`${(story.title || 'video-gambar').replace(/[^\w\- ]+/g, '').trim() || 'video-gambar'}.mp4`} className="flex-1 rounded-xl bg-[#d4ff64] py-2.5 text-center text-[13.5px] font-bold text-black">Download MP4</a>
          ) : (
            <button type="button" onClick={startRender} disabled={!hasVideo || busy || (render && !render.url && !render.error)} className="flex-1 rounded-xl bg-[#d4ff64] py-2.5 text-[13.5px] font-bold text-black disabled:opacity-40">
              {render && !render.error ? `Merender… ${Math.round((render.progress || 0) * 100)}%` : 'Render MP4'}
            </button>
          )}
          <span className="max-w-[45%] text-[10.5px] leading-snug text-white/35">{render?.error ? `Render gagal: ${render.error}` : `Dirender di browser ini, gratis, ${layoutOf(story.format).out.join('×')}. Biarkan tab terbuka.`}</span>
        </div>
      </section>
      <Handle onPointerDown={(e) => dragSide(e, -1)} />

      {/* Scenes and audio */}
      <aside className="flex shrink-0 flex-col gap-2.5 lg:min-h-0 lg:w-[var(--side-w)]" style={{ '--side-w': `${sideWidth}px` }}>
        <div role="tablist" className="flex rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/[0.06]">
          {[{ id: 'scenes', label: `Adegan (${story.scenes.length})` }, { id: 'audio', label: 'Audio' }].map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold ${tab === t.id ? 'bg-[#f2eee5] text-black' : 'text-white/55 hover:text-white'}`}>{t.label}</button>
          ))}
        </div>
        {tab === 'scenes'
          ? <ScenesEditor story={story} selected={Math.min(selected, Math.max(0, story.scenes.length - 1))} onSelect={selectScene} onChange={(scenes) => edit({ scenes })} disabled={busy} sceneErrors={sceneErrors} busy={busy} onAskAI={askAI} />
          : <AudioEditor story={story} onChange={edit} disabled={busy} />}
        {dirty && <button type="button" disabled={busy} onClick={saveAndPlan} className="rounded-xl bg-[#d4ff64] py-2.5 text-[13.5px] font-bold text-black disabled:opacity-40">Simpan & lihat rencana produksi</button>}
      </aside>
    </div>
  );
}
