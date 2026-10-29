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
import { codeKey } from './draw/sketch';

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
function StoryPreview({ story, onSceneError, renderRef, seekRef, toggleRef, onRender, onTime, onPlaying }) {
  const frame = useRef(null);
  const files = useRef(new Map()); // url → { bytes, type }: fetched once, a copy is sent each time
  if (renderRef) renderRef.current = (purpose = 'download') => frame.current?.contentWindow?.postMessage(purpose === 'cancel' ? { type: 'nexoclip-render-cancel' } : { type: 'nexoclip-render', purpose }, '*');
  if (seekRef) seekRef.current = (seconds) => frame.current?.contentWindow?.postMessage({ type: 'nexoclip-seek', seconds }, '*');
  if (toggleRef) toggleRef.current = () => frame.current?.contentWindow?.postMessage({ type: 'nexoclip-toggle' }, '*');
  const [ready, setReady] = useState(false);
  const props = useMemo(() => storyVideoProps(story), [story]);
  const key = useMemo(() => codeKey(JSON.stringify(props)), [props]);
  useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'nexoclip-player-ready') setReady(true);
      if (event.data?.type === 'nexoclip-player-error') onSceneError?.(event.data.scene, event.data.message);
      if (String(event.data?.type).startsWith('nexoclip-render-')) onRender?.(event.data);
      if (event.data?.type === 'nexoclip-time') onTime?.(Number(event.data.seconds) || 0);
      if (event.data?.type === 'nexoclip-playing') onPlaying?.(Boolean(event.data.playing));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onSceneError, onRender, onTime, onPlaying]);
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
      const sounds = await Promise.all((props.sounds || []).map(async (x) => ({ key: x.key, kind: x.kind, scene: x.scene, volume: x.volume, file: await resolve(x.url) })));
      if (!live) return;
      const assets = Object.fromEntries(resolved.filter(([, a]) => a && (a.data || a.file)));
      const transfer = [voice?.bytes, music?.bytes, ...Object.values(assets).map((a) => a.file?.bytes), ...sounds.map((x) => x.file?.bytes)].filter(Boolean);
      frame.current?.contentWindow?.postMessage({ type: 'nexoclip-story', key, props: { ...props, voice: null, music: null, assets: null, sounds: null }, audio: { voice, music }, assets, sounds: sounds.filter((x) => x.file) }, '*', transfer);
    })();
    return () => { live = false; };
  }, [ready, props, key]);
  return <iframe ref={frame} src="/motion-player" title="Pratinjau video" sandbox="allow-scripts" className="h-full w-full border-0 bg-black" />;
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

function Handle({ onPointerDown, onDoubleClick }) {
  return <div role="separator" aria-orientation="vertical" title="Seret untuk mengubah lebar" onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}
    className="hidden w-1.5 flex-none cursor-col-resize border-l border-white/[0.06] transition-colors hover:bg-[#d4ff64]/30 lg:block" />;
}

function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40">{label}{hint ? <span className="ml-1 font-normal normal-case tracking-normal text-white/25">{hint}</span> : null}</span>
      {children}
    </label>
  );
}
const inputClass = 'w-full rounded-lg border border-white/10 bg-[#0b0e13] px-2.5 py-1.5 text-[12px] leading-relaxed text-white/90 outline-none transition focus:border-[#d4ff64]/40 disabled:opacity-60';

function Icon({ d, size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
function Badge({ children, tone = 'default' }) {
  const tones = { default: 'bg-white/[0.06] text-white/60', accent: 'bg-[#d4ff64]/10 text-[#e4f5bd]', amber: 'bg-amber-400/10 text-amber-300', red: 'bg-red-400/10 text-red-300' };
  return <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium ${tones[tone]}`}>{children}</span>;
}
function Spinner() {
  return <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-[#d4ff64]" aria-hidden="true" />;
}

// A card in the chat, in the AI Director's look: a titled shell around a short summary, and its buttons.
function CardShell({ icon, title, accent, children, actions }) {
  return (
    <div className="w-full max-w-[380px]">
      <div className="rounded-[18px] border border-white/[0.09] bg-gradient-to-b from-[#1c1f25] to-[#121418] p-1.5 shadow-[0_10px_30px_#0006]">
        <div className="flex min-w-0 items-center gap-2 px-2.5 pb-2 pt-1.5">
          <span className="grid h-6 w-6 flex-none place-items-center rounded-md bg-[#d4ff64]/15 text-[12px] text-[#d4ff64]">{icon}</span>
          <span className="truncate text-[13px] font-semibold text-white">{title}{accent && <span className="text-[#d4ff64]"> — {accent}</span>}</span>
        </div>
        <div className="rounded-[14px] border border-white/[0.06] bg-gradient-to-b from-[#2a2e35] via-[#1d2026] to-[#17191d] p-3">{children}</div>
      </div>
      {actions && <div className="mt-2 flex gap-2">{actions}</div>}
    </div>
  );
}
const pillButton = 'flex-1 rounded-full border border-white/[0.1] bg-gradient-to-b from-[#2b2e34] to-[#1b1d21] py-2 text-[12px] font-semibold text-white/90 hover:border-white/25 disabled:opacity-50';
const acceptButton = 'flex-1 rounded-full bg-[#d4ff64] py-2 text-[12px] font-semibold text-[#10130a] hover:brightness-110 disabled:opacity-40';
const CARD_ICON = { brief: '✦', script: '✎', scene: '▦', plan: '▶' };

function Message({ message, story, onPick, onOpen, busy }) {
  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1.5">
        {message.attachments?.length > 0 && (
          <div className="flex max-w-[72%] flex-wrap justify-end gap-1.5">
            {message.attachments.map((a) => (
              <span key={a.key} title={a.name || a.key} className="relative h-16 w-16 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                {a.type === 'image'
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={a.url} alt={a.name || a.key} className="h-full w-full object-cover" />
                  : <video src={`${a.url}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />}
                {a.type === 'video' && <span className="absolute bottom-0 left-0 rounded-tr bg-black/70 px-1 text-[9px] text-white">▶</span>}
              </span>
            ))}
          </div>
        )}
        <div className="max-w-[72%] whitespace-pre-line break-words rounded-lg border border-white/[0.06] bg-[#181b20] px-3 py-1.5 text-[11.5px] leading-[1.6] text-white/90">{message.content}</div>
      </div>
    );
  }
  if (message.error) return <p className="text-[11.5px] leading-relaxed text-red-300/90">{message.content}</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11.5px] leading-[1.7] text-[#e6e7ea]"><Rich text={message.content} /></div>
      {message.credits > 0 && <span className="-mt-2 text-[10px] text-white/30">{message.credits} kredit</span>}
      {message.cards?.map((card, i) => {
        const scene = card.kind === 'scene' ? story.scenes[Number(card.scene)] : null;
        return (
          <CardShell key={i} icon={CARD_ICON[card.kind] || '✦'} title={{ brief: 'Brief', script: 'Naskah', scene: `Adegan ${Number(card.scene) + 1}`, plan: 'Rencana produksi' }[card.kind]} accent={card.kind === 'script' ? `${story.scenes.length} adegan` : ''}
            actions={<button type="button" onClick={() => onOpen(card)} className={pillButton}>Lihat</button>}>
            <p className="line-clamp-2 text-[12px] font-semibold text-white/85">{card.title || story.title || 'Lihat detail'}</p>
            {card.kind === 'brief' && story.brief && <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-white/60">{story.brief}</p>}
            {card.kind === 'script' && <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-white/60">{story.scenes.map((sc) => sc.text).join(' ')}</p>}
            {scene && <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-white/60">{scene.visual}</p>}
          </CardShell>
        );
      })}
      {message.ideas?.length > 0 && (
        <CardShell icon="💡" title="Ide" accent={`${message.ideas.length} pilihan`}>
          <ul className="flex flex-col gap-1.5">
            {message.ideas.map((idea, i) => (
              <li key={i}>
                <button type="button" disabled={busy} onClick={() => onPick(i, idea)}
                  className="w-full rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2 text-left transition hover:border-[#d4ff64]/40 disabled:opacity-50">
                  <span className="block text-[12px] font-semibold text-white/90">{i + 1}. {idea.title}</span>
                  <span className="block text-[11.5px] italic text-white/60">“{idea.hook}”</span>
                  {idea.angle && <span className="block text-[10.5px] text-white/40">{idea.angle}</span>}
                </button>
              </li>
            ))}
          </ul>
        </CardShell>
      )}
    </div>
  );
}

// The plan to approve, as an approval card like the AI Director's: what will be made and its cost.
function PlanNotice({ story, onOpen, onApprove, disabled }) {
  const p = story.pending;
  if (!p) return null;
  const rows = [
    p.what.includes('voice') && ['Suara narator', p.breakdown?.voice], p.what.includes('music') && ['Musik', p.breakdown?.music],
    p.what.includes('sounds') && ['Suara latar/efek', p.breakdown?.sounds], p.scenes?.length && [`Gambar ${p.scenes.length} adegan`, p.breakdown?.draw],
  ].filter(Boolean);
  return (
    <CardShell icon="▶" title="Rencana produksi" accent="perlu persetujuan"
      actions={<>
        <button type="button" onClick={() => onOpen({ kind: 'plan' })} className={pillButton}>Lihat rencana</button>
        <button type="button" disabled={disabled} onClick={onApprove} className={acceptButton}>Buat · {p.credits} kredit</button>
      </>}>
      <div className="mb-1.5"><Badge tone="amber">Menunggu approve</Badge></div>
      <ul className="space-y-0.5">
        {rows.map(([label, credits]) => <li key={label} className="flex justify-between gap-2 text-[11px] text-white/60"><span className="truncate">{label}</span><span className="flex-none text-white/40">±{credits ?? '?'} kr</span></li>)}
      </ul>
      <p className="mt-1.5 text-[12px] text-white/75">Estimasi <strong className="text-[#d4ff64]">{p.credits} kredit</strong></p>
    </CardShell>
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
      <section><h4 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40">Teks di layar</h4><p className="text-[14px] text-[#f2eee5]">{scene.text}</p></section>
      <section><h4 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40">Dibacakan narator</h4><p className="text-[13px] text-white/75">{scene.say || scene.text}</p></section>
      <section><h4 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40">Gambar & gerak</h4><p className="text-[13px] leading-relaxed text-white/75">{scene.visual}</p></section>
      {cast.length > 0 && <section><h4 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40">Tokoh</h4>{cast.map((c) => <p key={c.name} className="text-[12.5px] text-white/65"><b className="text-white/80">{c.name}</b>: {c.look}</p>)}</section>}
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
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-white/[0.07] bg-[#0b0e13]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <span className="text-[13px] font-semibold text-white">{title}</span>
        <button type="button" onClick={onClose} aria-label="Tutup" className="grid h-7 w-7 place-items-center rounded-md text-white/50 hover:bg-white/[0.06] hover:text-white">✕</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6"><div className="mx-auto max-w-[920px]">
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
            <Row k="Palet" v={story.palette?.colors?.length ? <span className="flex flex-wrap items-center gap-1">{story.palette.colors.map((c) => <span key={c} title={c} className="h-4 w-4 rounded ring-1 ring-white/20" style={{ background: c }} />)}{story.palette.note ? <span className="ml-1 text-white/50">{story.palette.note}</span> : null}</span> : ''} />
            <Row k="Teks" v={story.caption ? `${{ bottom: 'bawah', top: 'atas', middle: 'tengah', none: 'tanpa teks' }[story.caption.position]} · ${story.caption.font}${story.caption.box ? ' · kotak' : ''}` : ''} />
            <Row k="Bahasa visual" v={story.artDirection} />
            <Row k="Tokoh" v={story.cast.filter((c) => c.kind !== 'prop').map((c) => `${c.name}: ${c.look}${c.code ? ' (sudah didesain)' : ''}`).join(' · ')} />
            <Row k="Properti" v={story.cast.filter((c) => c.kind === 'prop').map((c) => `${c.name}: ${c.look}${c.code ? ' (sudah didesain)' : ''}`).join(' · ')} />
          </div>
        )}
        {card.kind === 'plan' && p && (
          <div className="mb-3 rounded-xl border border-[#d4ff64]/20 bg-[#d4ff64]/[0.04] p-3">
            <div className="mb-1 text-[12px] font-semibold text-[#f2eee5]">Yang akan dibuat</div>
            <div className="grid grid-cols-2 gap-1 text-[12px] text-white/70">
              {p.what.includes('voice') && <><span>Suara narator</span><span className="text-right">±{p.breakdown?.voice ?? '?'} kredit</span></>}
              {p.what.includes('music') && <><span>Musik</span><span className="text-right">±{p.breakdown?.music ?? '?'} kredit</span></>}
              {p.what.includes('sounds') && <><span>Suara latar/efek</span><span className="text-right">±{p.breakdown?.sounds ?? '?'} kredit</span></>}
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
                <li key={i} className={`rounded-xl border border-white/[0.07] px-3 py-2.5 ${card.kind === 'plan' && !drawn ? 'bg-white/[0.01] opacity-60' : 'bg-white/[0.025]'}`}>
                  <div className="mb-1 flex items-center justify-between text-[10.5px] text-white/40"><span className="font-mono">#{i + 1} · {scene.duration.toFixed(1)} dtk</span>{card.kind === 'plan' && <span>{drawn ? 'digambar' : 'tetap'}</span>}</div>
                  <p className="text-[13px] text-[#f2eee5]">🎙 {scene.say || scene.text}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-white/50">🖼 {scene.visual}</p>
                </li>
              );
            })}
          </ol>
        )}
      </div></div>
      {card.kind === 'plan' && p && (
        <div className="flex justify-end border-t border-white/[0.06] p-3">
          <button type="button" disabled={busy} onClick={onApprove} className="rounded-lg bg-[#d4ff64] px-4 py-2 text-[12px] font-semibold text-[#10130a] hover:brightness-110 disabled:opacity-40">Buat · ±{p.credits} kredit</button>
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
      <ol className="flex max-h-[38%] min-h-[120px] flex-col gap-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
        {story.scenes.map((s, i) => {
          const st = STATUS[sceneStatus(s, busy, sceneErrors[i])];
          return (
            <li key={i}>
              <button type="button" onClick={() => onSelect(i)} className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left text-[11.5px] transition ${i === selected ? 'border-[#d4ff64]/50 bg-[#d4ff64]/[0.06] text-white' : 'border-white/[0.06] bg-white/[0.02] text-white/70 hover:border-white/15'}`}>
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
            <span className="text-[13px] font-semibold text-white">Adegan {selected + 1} <span className="font-normal text-white/40">· {scene.duration.toFixed(1)} dtk</span></span>
            <Badge tone={{ jadi: 'accent', ulang: 'amber', gagal: 'red' }[sceneStatus(scene, busy, sceneErrors[selected])] || 'default'}>{STATUS[sceneStatus(scene, busy, sceneErrors[selected])].label}</Badge>
          </div>
          {(scene.codeError || sceneErrors[selected]) && <p className="rounded-lg bg-amber-400/10 px-2.5 py-1.5 text-[11.5px] text-amber-200/80">{scene.codeError || sceneErrors[selected]}</p>}
          <Field label="Teks di layar"><textarea rows={2} value={scene.text} disabled={disabled} onChange={(e) => update({ text: e.target.value })} className={inputClass} /></Field>
          <Field label="Dibacakan narator" hint="kata sama; boleh [tag], KAPITAL, ..."><textarea rows={2} value={scene.say} disabled={disabled} onChange={(e) => update({ say: e.target.value }, false)} className={inputClass} /></Field>
          <Field label="Gambar & gerak" hint={story.canvas === 2 ? "termasuk latarnya" : ""}><textarea rows={5} value={scene.visual} disabled={disabled} onChange={(e) => update({ visual: e.target.value })} className={inputClass} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Kamera"><select value={scene.camera} disabled={disabled} onChange={(e) => update({ camera: e.target.value }, false)} className={inputClass}>{STORY_CAMERAS.map((c) => <option key={c} value={c}>{CAMERA_LABELS[c] || c}</option>)}</select></Field>
            {/* the free canvas has no named backgrounds: the scene's setting is part of "Gambar & gerak" */}
            {story.canvas !== 2 && <Field label="Latar"><select value={scene.theme} disabled={disabled} onChange={(e) => update({ theme: e.target.value })} className={inputClass}>{themes.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>}
          </div>
          <Field label="Kata penekanan"><input value={scene.emphasis} disabled={disabled} onChange={(e) => update({ emphasis: e.target.value }, false)} className={inputClass} /></Field>
          <div className="flex flex-wrap gap-1.5 pt-1 text-[11.5px]">
            <button type="button" disabled={disabled} onClick={() => onAskAI(selected)} className="rounded-md bg-[#d4ff64] px-2.5 py-1 font-semibold text-[#10130a] disabled:opacity-40">Minta AI ubah</button>
            <button type="button" disabled={disabled} onClick={() => update({})} className="rounded-md border border-white/[0.1] px-2.5 py-1 text-white/75 hover:border-white/30">Gambar ulang</button>
            <button type="button" disabled={disabled || selected === 0} onClick={() => move(-1)} className="rounded-md border border-white/[0.1] px-2.5 py-1 text-white/75 hover:border-white/30 disabled:opacity-30">↑</button>
            <button type="button" disabled={disabled || selected === story.scenes.length - 1} onClick={() => move(1)} className="rounded-md border border-white/[0.1] px-2.5 py-1 text-white/75 hover:border-white/30 disabled:opacity-30">↓</button>
            <button type="button" disabled={disabled} onClick={add} className="rounded-md border border-white/[0.1] px-2.5 py-1 text-white/75 hover:border-white/30">+ Adegan</button>
            <button type="button" disabled={disabled || story.scenes.length < 3} onClick={remove} className="rounded-md border border-red-400/20 px-2.5 py-1 text-red-300/90 hover:border-red-400/50 disabled:opacity-30">Hapus</button>
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
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02]">
        <div className="flex items-center justify-between border-b border-white/[0.05] px-3 py-2 text-[11px]"><span className="font-semibold uppercase tracking-[0.08em] text-white/40">Naskah voiceover</span><span className={recorded ? 'text-[#d4ff64]/70' : 'text-white/40'}>{story.voice ? (recorded ? 'sudah direkam' : 'perlu direkam ulang') : 'belum direkam'}</span></div>
        <ol className="flex flex-col px-3 py-2 text-[12.5px] leading-relaxed text-white/70">
          {story.scenes.length ? story.scenes.map((s, i) => <li key={i} className="flex gap-2 py-0.5"><span className="w-5 font-mono text-[11px] text-white/30">{i + 1}</span><span>{s.say || s.text}</span></li>) : <li className="text-white/40">Belum ada naskah.</li>}
        </ol>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-white/75"><input type="checkbox" checked={story.music} disabled={disabled} onChange={(e) => onChange({ music: e.target.checked })} /> Musik latar</label>
      {story.music && <Field label="Prompt musik" hint="genre, suasana, instrumen, BPM, era"><textarea rows={4} value={story.musicPrompt} disabled={disabled} onChange={(e) => onChange({ musicPrompt: e.target.value })} className={inputClass} /></Field>}
      {story.musicTrack && <p className="text-[11px] text-white/40">{story.musicFor === story.musicPrompt ? 'Musik sudah dibuat dari prompt ini.' : 'Prompt berubah: musik akan dibuat ulang.'}</p>}
      {story.sounds?.length > 0 && (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40">Suara latar & efek khusus</div>
          {story.sounds.map((x) => (
            <div key={x.key} className="flex items-start gap-2 border-b border-white/[0.04] py-1.5 text-[12px] last:border-0">
              <span className="flex-1 text-white/70"><b className="text-white/85">{x.key}</b> · {x.kind === 'effect' ? 'efek' : x.scene === null ? 'latar seluruh video' : `latar adegan ${x.scene + 1}`} · {x.seconds}s<br /><span className="text-white/45">{x.prompt}</span></span>
              <span className="text-[10.5px] text-white/35">{x.url && x.madeFrom === x.prompt ? 'jadi' : 'belum dibuat'}</span>
              <button type="button" disabled={disabled} onClick={() => onChange({ sounds: story.sounds.filter((y) => y.key !== x.key) })} className="text-[11px] text-red-300/70 hover:text-red-300">hapus</button>
            </div>
          ))}
        </div>
      )}
      {Object.keys(story.assets || {}).length > 0 && (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40">Gambar & animasi dari luar</div>
          {Object.entries(story.assets).map(([key, a]) => <p key={key} className="text-[11.5px] text-white/55"><span className="font-mono text-[#d4ff64]/70">{key}</span> {a.credit ? `· ${a.credit}` : ''}</p>)}
        </div>
      )}
    </div>
  );
}

const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function Lane({ label, color, children }) {
  return (
    <div className="flex h-7">
      <span className={`sticky left-0 z-20 inline-flex h-full w-[52px] flex-none items-center rounded-l bg-[#101318] px-1.5 text-[9px] font-semibold uppercase tracking-wide ${color}`}>{label}</span>
      <div className="relative flex-1 rounded-r bg-white/[0.025]">{children}</div>
    </div>
  );
}
function Block({ from, length, total, tone, title, onClick, children }) {
  return (
    <button type="button" title={title} onClick={onClick} style={{ left: `${(from / total) * 100}%`, width: `${(length / total) * 100}%` }}
      className={`absolute bottom-1 top-1 overflow-hidden rounded px-1.5 text-left text-[9.5px] leading-[18px] text-white/90 ${tone}`}>
      <span className="pointer-events-none block truncate">{children}</span>
    </button>
  );
}

// The AI Director's timeline: a time ruler, the scenes as clips, and lanes for the narrator, music and made
// sounds, with the playhead. Clicking a scene or the ruler jumps there.
function Timeline({ story, selected, onSelect, onSeek, now, playing, onToggle, busy, sceneErrors, onOpenAudio }) {
  const [zoom, setZoom] = useState(1);
  const starts = [];
  let total = 0;
  for (const scene of story.scenes) { starts.push(total); total += scene.duration; }
  if (!story.scenes.length) return null;
  const step = total > 90 ? 10 : total > 40 ? 5 : total > 15 ? 2 : 1;
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step);
  const voiceReady = story.voice && story.voiceText === narration(story);
  const musicReady = story.musicTrack && story.musicFor === story.musicPrompt;
  const seekAt = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(total, ((event.clientX - box.left) / box.width) * total)));
  };
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0f1216] p-2">
      <div className="mb-1 flex flex-wrap items-center gap-2 px-1">
        <button type="button" onClick={onToggle} aria-label={playing ? 'Jeda' : 'Putar'} className="grid h-7 w-7 place-items-center rounded-full bg-white text-black">
          {playing ? <Icon d="M8 5v14 M16 5v14" size={12} /> : <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z" /></svg>}
        </button>
        <span className="font-mono text-[11px] text-white/80">{fmtTime(now)}</span>
        <span className="font-mono text-[11px] text-white/35">/ {fmtTime(total)}</span>
        <span className="ml-auto text-[10px] text-white/35">Zoom</span>
        <button type="button" onClick={() => setZoom((z) => Math.max(1, z / 1.5))} disabled={zoom <= 1} className="grid h-5 w-5 place-items-center rounded text-[12px] text-white/60 hover:bg-white/[0.08] disabled:opacity-30">−</button>
        <input type="range" min={1} max={6} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom timeline" className="w-24 accent-[#d4ff64]" />
        <button type="button" onClick={() => setZoom((z) => Math.min(6, z * 1.5))} disabled={zoom >= 6} className="grid h-5 w-5 place-items-center rounded text-[12px] text-white/60 hover:bg-white/[0.08] disabled:opacity-30">+</button>
        <button type="button" onClick={() => setZoom(1)} className="rounded px-1.5 text-[10px] text-white/45 hover:text-white">Pas layar</button>
      </div>
      <div className="overflow-x-auto overflow-y-hidden [scrollbar-width:thin]">
        <div className="relative" style={{ width: `${zoom * 100}%`, minWidth: '100%' }}>
          <div className="flex"><span className="sticky left-0 z-20 w-[52px] flex-none bg-[#0f1216]" />
          <div className="relative h-4 flex-1 cursor-pointer text-[9px] text-white/30" onClick={seekAt}>
            {ticks.map((t) => <span key={t} className="absolute bottom-0 border-l border-white/20 pl-1 leading-none" style={{ left: `${(t / total) * 100}%` }}>{fmtTime(t)}</span>)}
          </div></div>
          <div className="mt-1 flex"><span className="sticky left-0 z-20 inline-flex h-16 w-[52px] flex-none items-center whitespace-nowrap rounded-l bg-[#101318] px-1.5 text-[8.5px] font-semibold uppercase text-white/50">Adegan</span>
          <div className="flex h-16 flex-1 overflow-hidden rounded-r">
            {story.scenes.map((s, i) => {
              const st = STATUS[sceneStatus(s, busy, sceneErrors[i])];
              return (
                <button key={i} type="button" onClick={() => onSelect(i)} title={`${i + 1}. ${s.text}`} style={{ width: `${(s.duration / total) * 100}%` }}
                  className={`relative flex h-full flex-none flex-col justify-between overflow-hidden border-r border-black bg-gradient-to-b from-[#20242b] to-[#15181d] px-1.5 py-1 text-left hover:from-[#272c34] ${i === selected ? 'ring-2 ring-inset ring-[#d4ff64]' : ''}`}>
                  <span className="flex items-center gap-1"><span className="rounded bg-black/60 px-1 text-[9px] text-white">{i + 1}</span><span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} title={st.label} /></span>
                  <span className="line-clamp-2 text-[9.5px] leading-tight text-white/55">{s.text}</span>
                </button>
              );
            })}
          </div></div>
          <div className="mt-1 space-y-1">
            <Lane label="VO" color="text-violet-200">
              {story.scenes.map((s, i) => (
                <Block key={i} from={starts[i]} length={s.duration} total={total} onClick={() => onSelect(i)} title={`Narator adegan ${i + 1}: ${s.say || s.text}`}
                  tone={voiceReady ? 'bg-violet-500/60 hover:bg-violet-500/80' : 'border border-dashed border-violet-300/50 bg-violet-500/15 hover:bg-violet-500/30'}>{s.say || s.text}</Block>
              ))}
            </Lane>
            <Lane label="Musik" color="text-sky-200">
              {story.music
                ? <Block from={0} length={total} total={total} onClick={onOpenAudio} title={story.musicPrompt || 'Musik latar'}
                  tone={musicReady ? 'bg-sky-500/50 hover:bg-sky-500/70' : 'border border-dashed border-sky-300/50 bg-sky-500/15 hover:bg-sky-500/30'}>{story.musicPrompt || 'Musik latar'}</Block>
                : <button type="button" onClick={onOpenAudio} className="absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] text-white/35 hover:bg-white/[0.06] hover:text-white/70">+ Tambah</button>}
            </Lane>
            <Lane label="Suara" color="text-amber-200">
              {(story.sounds || []).filter((x) => x.kind !== 'effect').map((x) => {
                const whole = x.scene === null || !story.scenes[x.scene];
                const from = whole ? 0 : starts[x.scene];
                const length = whole ? total : story.scenes[x.scene].duration;
                return <Block key={x.key} from={from} length={length} total={total} onClick={onOpenAudio} title={x.prompt}
                  tone={x.url && x.madeFrom === x.prompt ? 'bg-amber-500/45 hover:bg-amber-500/65' : 'border border-dashed border-amber-300/50 bg-amber-500/15 hover:bg-amber-500/30'}>{x.key}</Block>;
              })}
              {!(story.sounds || []).some((x) => x.kind !== 'effect') && <span className="absolute left-2 top-1.5 text-[10px] text-white/25">efek dari pustaka ikut di tiap adegan</span>}
            </Lane>
          </div>
          <div className="pointer-events-none absolute bottom-0 left-[52px] right-0 top-0 z-30">
            <div className="absolute bottom-0 top-0 w-0.5 bg-[#d4ff64] shadow-[0_0_6px_#d4ff64]" style={{ left: `${(Math.min(now, total) / total) * 100}%` }} />
          </div>
        </div>
      </div>
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
  // the smooth preview: the video rendered at half size in the background, played as a file
  const [smooth, setSmooth] = useState(null); // { key, url } when ready
  const [smoothRun, setSmoothRun] = useState(null); // { progress } while it renders
  const [smoothTry, setSmoothTry] = useState(0);
  const videoRef = useRef(null);
  const seekAt = useRef(null);
  const [atBottom, setAtBottom] = useState(true);
  const [files, setFiles] = useState([]); // [{ id, url, contentType, name, uploading }]
  const [pane, setPane] = useState('chat'); // phones: chat or video
  const [switcher, setSwitcher] = useState(false);
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const toggleRef = useRef(null);
  const [chatWidth, dragChat] = useResizable('nexoclip_motion_chat_w', 420, 320, 640);
  const [sideWidth, dragSide] = useResizable('nexoclip_motion_side_w', 340, 280, 520);
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
    const ready = files.filter((f) => f.id);
    if ((!message && !ready.length) || busy || files.some((f) => f.uploading)) return;
    setText('');
    setFiles([]);
    run({ type: 'story-chat', message, attachments: ready }, message || '(kirim file)');
  };
  // Pictures and videos for the AI to look at (style to copy, photos to animate), uploaded as workspace assets.
  const attach = async (list) => {
    for (const file of [...list].slice(0, 6 - files.length)) {
      if (!/^(image|video)\//.test(file.type)) { setError('Kirim gambar atau video saja.'); continue; }
      if (file.type.startsWith('video/') && file.size > 30 * 1024 * 1024) { setError('Video referensi maksimal 30 MB.'); continue; }
      const temp = `${Date.now()}-${file.name}`;
      setFiles((f) => [...f, { temp, name: file.name, contentType: file.type, uploading: true, preview: URL.createObjectURL(file) }]);
      try {
        const form = new FormData();
        form.append('file', file);
        const response = await fetch('/api/uploads', { method: 'POST', body: form, credentials: 'include', headers: { 'x-workspace-id': window.sessionStorage.getItem('nexoclip_workspace_id') || '' } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Upload gagal.');
        setFiles((f) => f.map((x) => (x.temp === temp ? { ...x, id: data.id, url: data.url, contentType: data.contentType || file.type, uploading: false } : x)));
      } catch (err) {
        setFiles((f) => f.filter((x) => x.temp !== temp));
        setError(err.message);
      }
    }
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
    seekAt.current?.(start + 0.05);
  };
  const askAI = (i) => { setText(`Adegan ${i + 1}: `); inputRef.current?.focus(); };
  const storyKey = useMemo(() => codeKey(JSON.stringify(storyVideoProps(story))), [story]);
  const keyRef = useRef(storyKey);
  keyRef.current = storyKey;
  const onRender = useCallback((data) => {
    if (data.purpose === 'preview') {
      if (data.type === 'nexoclip-render-progress') setSmoothRun({ progress: data.progress });
      if (data.type === 'nexoclip-render-failed') { setSmoothRun(null); if (!data.aborted && data.key !== keyRef.current) setSmoothTry((n) => n + 1); }
      if (data.type === 'nexoclip-render-done') {
        setSmoothRun(null);
        if (data.key === keyRef.current) setSmooth((old) => { if (old?.url) URL.revokeObjectURL(old.url); return { key: data.key, url: URL.createObjectURL(new Blob([data.bytes], { type: 'video/mp4' })) }; });
        else setSmoothTry((n) => n + 1); // the video changed while it rendered
      }
      return;
    }
    if (data.type === 'nexoclip-render-progress') setRender({ progress: data.progress });
    if (data.type === 'nexoclip-render-failed') setRender({ error: data.message });
    if (data.type === 'nexoclip-render-done') setRender({ url: URL.createObjectURL(new Blob([data.bytes], { type: 'video/mp4' })) });
  }, []);
  const startRender = () => { setRender({ progress: 0 }); setSmoothRun(null); renderRef.current?.('download'); };
  const onSceneError = useCallback((scene, message) => setSceneErrors((e) => (e[scene] ? e : { ...e, [scene]: message })), []);

  const totalSeconds = Math.round(story.scenes.reduce((sum, scene) => sum + scene.duration, 0));
  const hasVideo = story.scenes.some((scene) => scene.code);
  const smoothReady = smooth?.key === storyKey;
  // Make the smooth preview a few seconds after the video settles (drawn, saved, nothing running); a change
  // stops one in progress.
  const downloading = Boolean(render && !render.url && !render.error);
  useEffect(() => {
    if (!hasVideo || busy || dirty || smoothReady || downloading) return undefined;
    const timer = setTimeout(() => { setSmoothRun({ progress: 0 }); renderRef.current?.('preview'); }, 2500);
    return () => clearTimeout(timer);
  }, [storyKey, hasVideo, busy, dirty, smoothReady, downloading, smoothTry]);
  useEffect(() => () => { renderRef.current?.('cancel'); }, [storyKey]);
  // While the smooth preview plays, the timeline follows the file (every frame, not every timeupdate).
  useEffect(() => {
    if (!smoothReady || !playing) return undefined;
    let frame;
    const tick = () => { if (videoRef.current) setNow(videoRef.current.currentTime); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [smoothReady, playing]);
  const seekTo = (t) => {
    if (smoothReady && videoRef.current) { videoRef.current.currentTime = t; setNow(t); } else seekRef.current?.(t);
  };
  seekAt.current = seekTo;
  const togglePlay = () => {
    const v = videoRef.current;
    if (smoothReady && v) { if (v.paused) v.play().catch(() => {}); else v.pause(); } else toggleRef.current?.();
  };
  const progressLine = busy && !streaming ? (job.progress || 'Menunggu giliran…') : '';
  const style = drawStyleOf(story.styleSpec || story.style);
  const current = projects.find((p) => p.id === projectId);
  const rendering = render && !render.url && !render.error;
  const canSend = !busy && (text.trim() || files.some((f) => f.id)) && !files.some((f) => f.uploading);

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="flex border-b border-white/[0.06] lg:hidden">
        {[['chat', 'Chat'], ['board', 'Video']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setPane(id)}
            className={`flex-1 py-2.5 text-[12px] ${pane === id ? 'border-b-2 border-[#d4ff64] text-white' : 'text-white/45'}`}>{label}</button>
        ))}
      </div>

      {/* Chat */}
      <section style={{ '--chat-w': `${chatWidth}px` }}
        className={`${pane === 'chat' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col lg:flex lg:w-[var(--chat-w)] lg:flex-none`}>
        {authenticated && (
          <div className="relative border-b border-white/[0.06] p-3">
            <button type="button" disabled={busy} onClick={() => setSwitcher((v) => !v)}
              className="flex w-full items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2 text-left hover:border-white/15 disabled:opacity-60">
              <span className="grid h-6 w-6 flex-none place-items-center rounded-md bg-[#d4ff64]/10 text-[10px] font-bold text-[#d4ff64]">{(current?.firstTitle || current?.name || story.title || 'M').slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[12px] font-semibold text-white/90">{projectId ? (story.title || current?.firstTitle || current?.name || NEW_NAME) : 'Video baru'}</strong>
                <small className="block text-[10px] text-white/40">{projects.length} project</small>
              </span>
              <Icon d="m6 9 6 6 6-6" />
            </button>
            {switcher && (
              <div className="absolute left-3 right-3 top-full z-40 -mt-1 max-h-[50vh] overflow-y-auto rounded-xl border border-white/10 bg-[#0e1117] p-1 shadow-[0_18px_50px_#0009]">
                <button type="button" onClick={() => { setSwitcher(false); newStory(); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-[#d4ff64] hover:bg-white/[0.05]">+ Video baru</button>
                {projects.map((p) => (
                  <button key={p.id} type="button" onClick={() => { setSwitcher(false); openProject(p.id).catch((err) => setError(err.message)); }}
                    className={`flex w-full items-center gap-2 truncate rounded-lg px-2.5 py-2 text-left text-[12px] hover:bg-white/[0.05] ${p.id === projectId ? 'text-white' : 'text-white/65'}`}>{p.firstTitle || p.name}</button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="relative min-h-0 flex-1">
          <div ref={listRef} onScroll={onScroll} className="absolute inset-0 space-y-4 overflow-y-auto overscroll-contain px-4 py-5 [scrollbar-width:thin]">
            {!story.chat.length && (
              <div className="pt-6 text-center">
                <div className="inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.18em] text-white/50"><span className="h-[5px] w-[5px] rounded-full bg-[#d4ff64] shadow-[0_0_10px_#d4ff6480]" /> AI MOTION</div>
                <h2 className="mt-3 font-display text-[20px] font-semibold text-white">Video animasi dari obrolan</h2>
                <p className="mx-auto mt-2 max-w-[340px] text-[12px] leading-relaxed text-white/50">Ceritakan videonya, kirim foto/video referensi, atau tempel link web. AI mengusulkan gaya, tempo, suara dan ide, lalu menulis naskah dan menggambarnya.</p>
                <div className="mt-5 flex flex-col gap-1.5 text-left">
                  {EXAMPLES.map((example) => (
                    <button key={example} type="button" onClick={() => send(example)} disabled={busy}
                      className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[11.5px] text-white/70 hover:border-white/15 hover:text-white">{example}</button>
                  ))}
                </div>
              </div>
            )}
            {story.chat.map((message, i) => (
              <Message key={i} message={message} story={story} busy={busy} onOpen={setCard} onPick={(n, idea) => send(`Pakai ide ${n + 1}: ${idea.title}`)} />
            ))}
            {streaming && <div className="text-[11.5px] leading-[1.7] text-[#e6e7ea]"><Rich text={streaming} /><span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-[#d4ff64]/70 align-middle" /></div>}
            {!busy && !dirty && <PlanNotice story={story} onOpen={setCard} onApprove={produce} disabled={busy} />}
            {progressLine && <div className="flex items-center gap-2 text-[10.5px] text-white/40"><Spinner /> {progressLine}</div>}
            {error && <p className="text-[11.5px] leading-relaxed text-red-300/90">{error}</p>}
          </div>
          {!atBottom && <button type="button" onClick={() => { toBottom(); setAtBottom(true); }} className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-[#11151b] px-3 py-1.5 text-[11px] text-white/80 shadow-lg">↓ Pesan terbaru</button>}
        </div>
        <div className="space-y-2 border-t border-white/[0.06] p-3">
          {dirty && <p className="rounded-lg border border-amber-300/15 bg-amber-300/[0.05] px-3 py-2 text-[11px] text-amber-200/80">Ada editan yang belum disimpan. Simpan dulu (panel kanan) sebelum minta AI.</p>}
          <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); attach(e.dataTransfer.files); }}
            className="relative rounded-2xl border border-white/10 bg-[#0b0e13] p-2 focus-within:border-[#d4ff64]/40">
            {files.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5 px-1">
                {files.map((f) => (
                  <div key={f.temp} title={f.name} className="relative h-12 w-12 overflow-hidden rounded-md border border-white/15">
                    {f.contentType.startsWith('image/')
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={f.preview} alt={f.name} className="h-full w-full object-cover" />
                      : <video src={f.preview} muted playsInline className="h-full w-full object-cover" />}
                    {f.uploading && <span className="absolute inset-0 grid place-items-center bg-black/50 text-[9px] text-white/80">…</span>}
                    <button type="button" onClick={() => setFiles((list) => list.filter((x) => x.temp !== f.temp))} aria-label="Hapus lampiran"
                      className="absolute right-0 top-0 grid h-4 w-4 place-items-center rounded-bl bg-black/80 text-[10px] text-white">×</button>
                  </div>
                ))}
              </div>
            )}
            <textarea ref={inputRef} value={text} onChange={(e) => setText(e.target.value.slice(0, 2000))} rows={2} disabled={busy}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              onPaste={(e) => { if (e.clipboardData?.files?.length) { e.preventDefault(); attach(e.clipboardData.files); } }}
              placeholder={busy ? 'Tunggu AI selesai…' : story.scenes.length ? 'mis. adegan 3 ganti jadi api unggun, narasinya lebih santai' : 'Ceritakan videonya, lampirkan gambar/video, atau tempel link…'}
              className="block max-h-40 min-h-[40px] w-full resize-none bg-transparent px-1.5 py-1 text-[11.5px] text-white outline-none placeholder:text-white/30" />
            <div className="mt-1.5 flex items-center gap-1.5">
              <label title="Tambah gambar atau video (bisa juga paste / seret ke sini)"
                className={`grid h-7 w-7 flex-none cursor-pointer place-items-center rounded-lg text-white/55 hover:bg-white/[0.07] hover:text-white ${busy || files.length >= 6 ? 'pointer-events-none opacity-40' : ''}`}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.4 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
                <input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { attach(e.target.files); e.target.value = ''; }} />
              </label>
              <span className="truncate text-[10px] text-white/30">Gaya: {story.styleSpec ? style.label : 'dipilih AI'} · {story.format}</span>
              <button type="button" onClick={() => send()} disabled={!canSend} aria-label="Kirim pesan"
                className="ml-auto grid h-8 w-8 flex-none place-items-center rounded-lg bg-[#d4ff64] text-[#10130a] disabled:bg-white/10 disabled:text-white/30">
                {busy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon d="M5 12h14M13 6l6 6-6 6" />}
              </button>
            </div>
          </div>
          <div className="px-1 text-[10px] text-white/30">Kredit project ini: {Math.round(story.chat.reduce((sum, m) => sum + (Number(m.credits) || 0), 0) * 10) / 10} · Enter untuk kirim, Shift+Enter baris baru</div>
        </div>
      </section>
      <Handle onPointerDown={(e) => dragChat(e, 1)} />

      {/* Workspace */}
      <section className={`${pane === 'board' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col lg:flex`}>
        <div className="flex items-center gap-2 overflow-x-auto border-b border-white/[0.06] px-3 py-2.5">
          <div className="min-w-0 pl-1">
            <div className="truncate text-[13px] font-semibold text-white">{story.title || NEW_NAME}</div>
            <div className="truncate text-[10px] text-white/40">{[story.kind, totalSeconds ? `${totalSeconds} dtk` : '', story.scenes.length ? `${story.scenes.length} adegan` : ''].filter(Boolean).join(' · ') || 'Belum ada naskah'}</div>
          </div>
          <div className="ml-auto flex flex-none items-center gap-1.5">
            {story.brief && <button type="button" onClick={() => setCard({ kind: 'brief' })} className="rounded-md hover:opacity-80"><Badge>Brief</Badge></button>}
            {story.scenes.length > 0 && <button type="button" onClick={() => setCard({ kind: 'script' })} className="rounded-md hover:opacity-80"><Badge>Naskah</Badge></button>}
            <span title="Gaya gambar" className="hidden sm:inline"><Badge tone="accent">{story.styleSpec ? style.label : 'Gaya: dipilih AI'}</Badge></span>
            <label title="Rasio video. Ganti rasio = semua adegan digambar ulang." className="relative flex items-center">
              <select value={story.format} disabled={busy} onChange={(e) => edit({ format: e.target.value, scenes: story.scenes.map((sc) => ({ ...sc, redraw: true })) })}
                className="h-[22px] cursor-pointer appearance-none rounded-md bg-white/[0.06] pl-1.5 pr-5 text-[10px] font-medium text-white/70 outline-none hover:text-white">
                {FORMAT_IDS.map((f) => <option key={f} value={f} className="bg-[#16181d]">{f} · {FORMATS[f].label}</option>)}
              </select>
              <svg className="pointer-events-none absolute right-1 text-white/40" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6" /></svg>
            </label>
            {story.pending && !dirty && (
              <button type="button" onClick={produce} disabled={busy} title="Lihat rencana di chat dulu; ini sama dengan tombol Buat di kartu rencana."
                className="ml-1 flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#d4ff64] px-3 py-1.5 text-[12px] font-medium text-[#10130a] hover:brightness-110 disabled:opacity-40">
                <Icon d="M5 3l14 9-14 9V3z" /> Buat · {story.pending.credits} kr
              </button>
            )}
            {render?.url ? (
              <a href={render.url} download={`${(story.title || 'video-gambar').replace(/[^\w\- ]+/g, '').trim() || 'video-gambar'}.mp4`}
                className="ml-1 flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#d4ff64] px-3 py-1.5 text-[12px] font-medium text-[#10130a]"><Icon d="M12 4v11 M7 10l5 5 5-5 M5 20h14" /> Download MP4</a>
            ) : (
              <button type="button" onClick={startRender} disabled={!hasVideo || busy || rendering}
                title={render?.error ? `Render gagal: ${render.error}` : `Render MP4 ${layoutOf(story.format).out.join('×')} di browser ini (gratis). Biarkan tab terbuka.`}
                className="ml-1 flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/85 hover:border-white/25 disabled:opacity-40">
                <Icon d="M12 4v11 M7 10l5 5 5-5 M5 20h14" /> {rendering ? `Merender… ${Math.round((render.progress || 0) * 100)}%` : render?.error ? 'Render ulang' : 'Export'}
              </button>
            )}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 md:p-4 xl:flex-row xl:overflow-hidden">
          <div className="flex min-h-[70vh] min-w-0 flex-1 flex-col gap-2 xl:min-h-0">
            {card && <DetailPanel card={card} story={story} onClose={() => setCard(null)} onApprove={produce} busy={busy} />}
            {/* kept mounted under an open panel, so a render in progress goes on */}
            <div className={`${card ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col gap-2`}>
                <div className="relative flex min-h-[260px] min-w-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-black">
                  <div className="relative h-full max-h-full" style={{ aspectRatio: { '9:16': '9 / 16', '4:5': '4 / 5', '1:1': '1 / 1', '16:9': '16 / 9' }[story.format] || '9 / 16', maxWidth: '100%' }}>
                    {hasVideo && smoothReady && (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video ref={videoRef} key={smooth.url} src={smooth.url} controls playsInline className="absolute inset-0 z-10 h-full w-full bg-black object-contain"
                        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onSeeked={(e) => setNow(e.currentTarget.currentTime)} onTimeUpdate={(e) => { if (!playing) setNow(e.currentTarget.currentTime); }} />
                    )}
                    {hasVideo ? <StoryPreview story={story} onSceneError={onSceneError} renderRef={renderRef} seekRef={seekRef} toggleRef={toggleRef} onRender={onRender} onTime={smoothReady ? null : setNow} onPlaying={smoothReady ? null : setPlaying} /> : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
                        <p className="text-[13px] text-white/60">{story.scenes.length ? 'Naskah siap. Cek rencana produksinya di chat.' : 'Mulai dari chat'}</p>
                        <p className="max-w-xs text-[11px] text-white/35">Pratinjau muncul begitu adegan pertama selesai digambar.</p>
                      </div>
                    )}
                  </div>
                </div>
                {hasVideo && (
                  <div className="flex items-center gap-2 px-1 text-[10.5px] text-white/40">
                    {smoothReady ? <><span className="h-1.5 w-1.5 rounded-full bg-[#d4ff64]" /> Pratinjau mulus (versi video jadi, setengah resolusi)</>
                      : smoothRun ? <><Spinner /> Menyiapkan pratinjau mulus… {Math.round((smoothRun.progress || 0) * 100)}% · sementara diputar langsung (bisa patah-patah)</>
                        : <><span className="h-1.5 w-1.5 rounded-full bg-amber-300" /> Diputar langsung dari gambar (bisa patah-patah); versi mulus dibuat otomatis setelah selesai</>}
                  </div>
                )}
                <Timeline story={story} selected={selected} onSelect={selectScene} onSeek={seekTo} now={now} playing={playing} onToggle={togglePlay}
                  busy={busy} sceneErrors={sceneErrors} onOpenAudio={() => setTab('audio')} />
            </div>
          </div>

          {/* Scenes and audio */}
          <aside style={{ '--side-w': `${sideWidth}px` }} className="relative flex min-h-[60vh] w-full flex-none flex-col rounded-xl border border-white/[0.07] bg-[#0b0e13] xl:min-h-0 xl:w-[var(--side-w)]">
            <div onPointerDown={(e) => dragSide(e, -1)} title="Seret untuk mengubah lebar" className="absolute -left-2.5 bottom-0 top-0 hidden w-1.5 cursor-col-resize rounded-full hover:bg-[#d4ff64]/30 xl:block" />
            <div className="flex items-center gap-1 border-b border-white/[0.06] px-2 py-2">
              {[{ id: 'scenes', label: 'Adegan', count: story.scenes.length }, { id: 'audio', label: 'Audio' }].map((t) => (
                <button key={t.id} type="button" onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium ${tab === t.id ? 'bg-[#d4ff64] text-[#10130a]' : 'text-white/60 hover:bg-white/[0.05] hover:text-white'}`}>
                  {t.label}{t.count ? <span className={tab === t.id ? 'text-[#10130a]/60' : 'text-white/35'}>{t.count}</span> : null}
                </button>
              ))}
            </div>
            <div className="flex min-h-0 flex-1 flex-col p-3">
              {tab === 'scenes'
                ? <ScenesEditor story={story} selected={Math.min(selected, Math.max(0, story.scenes.length - 1))} onSelect={selectScene} onChange={(scenes) => edit({ scenes })} disabled={busy} sceneErrors={sceneErrors} busy={busy} onAskAI={askAI} />
                : <AudioEditor story={story} onChange={edit} disabled={busy} />}
            </div>
            {dirty && (
              <div className="border-t border-white/[0.06] p-3">
                <button type="button" disabled={busy} onClick={saveAndPlan} className="w-full rounded-lg bg-[#d4ff64] py-2 text-[12px] font-semibold text-[#10130a] hover:brightness-110 disabled:opacity-40">Simpan & lihat rencana produksi</button>
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
