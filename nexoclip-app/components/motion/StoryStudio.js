'use client';

// AI Motion (StoryStudio): aligned 1:1 with AI Director's architecture —
// collapsible secondary project sidebar + full-bleed DotGrid start screen with
// Home-grade hero composer + serene centered chat canvas + on-demand split Video Board
// (cinematic stage, timeline, and Scenes / Audio inspector).

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ChevronDown,
  LayoutPanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  Search,
  SendHorizontal,
  SquarePen,
  Wand2,
  X,
} from 'lucide-react';
import { STORY_CAMERAS, cleanStory, drawStyleOf, paceOf, storyVideoProps } from './draw/story';
import { ELEVENLABS_VOICES } from '../../src/services/elevenlabsAudio';
import { FORMATS, FORMAT_IDS, layoutOf } from './draw/layout';
import { lottieUrl, sanitizeLottie } from './lottieLibrary';
import { codeKey } from './draw/sketch';
import { NxDirectorSkeleton } from '../ui/nx-loading';

const LAST_STORY_KEY = 'nexoclip_motion_story_last';
const NEW_NAME = 'Animated video';
const EXAMPLES = [
  'Educational video about Homo sapiens for middle schoolers, fun and easy to follow',
  'Gentle motivation for tired college students, 30 seconds',
  'Iced brown sugar latte promo, 20% off this weekend',
  'Short fable about an honest clever deer',
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
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

// Animated typewriter placeholder matching AI Director & Studio Home hero composer.
const MotionTypewriter = memo(function MotionTypewriter({ phrases }) {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setTyped(phrases[0] || '');
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
  }, [phrases]);

  return (
    <div className="dr-composer-typewriter" aria-hidden="true">
      <span>{typed}</span>
      <i className="dr-composer-caret" />
    </div>
  );
});

// The sandboxed player. Audio and pictures are resolved here (the frame has no session or network): a storage
// URL, or the bytes; Noto emoji are fetched from Google's CDN and cleaned.
function StoryPreview({ story, onSceneError, renderRef, seekRef, toggleRef, onRender, onTime, onPlaying }) {
  const frame = useRef(null);
  const files = useRef(new Map());
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
        ...entries.map(async ([k, asset]) => {
          if (asset.type === 'lottie' && asset.source === 'noto') {
            try { return [k, { type: 'lottie', data: sanitizeLottie(await (await fetch(lottieUrl(k))).json()) }]; } catch { return [k, null]; }
          }
          if (asset.type === 'image') return [k, { type: 'image', file: await resolve(asset.url) }];
          return [k, null];
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
  return <iframe ref={frame} src="/motion-player" title="Video preview" sandbox="allow-scripts" className="h-full w-full border-0 bg-black" />;
}

// The AI writes light markdown (**bold**, "- " and "1. " lists, ## headings); show it as text, not as stars.
function Rich({ text }) {
  const inline = (line, key) => line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (
    /^\*\*[^*]+\*\*$/.test(part) ? <strong key={`${key}-${i}`} className="font-semibold text-[#14141f]">{part.slice(2, -2)}</strong> : part.replace(/\*\*/g, '')
  ));
  return String(text || '').split('\n').map((raw, i) => {
    const line = raw.replace(/^#{1,6}\s+/, '');
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (bullet) return <div key={i} className="flex gap-2 pl-1"><span className="text-[#7a7b90]">•</span><span>{inline(bullet[1], i)}</span></div>;
    if (numbered) return <div key={i} className="flex gap-2 pl-1"><span className="font-medium text-[#7a7b90]">{numbered[1]}.</span><span>{inline(numbered[2], i)}</span></div>;
    if (!line.trim()) return <div key={i} className="h-2" />;
    return <div key={i}>{inline(line, i)}</div>;
  });
}

const CAMERA_LABELS = { push: 'Push in', pull: 'Pull out', 'pan-left': 'Pan left', 'pan-right': 'Pan right', 'tilt-up': 'Tilt up', 'tilt-down': 'Tilt down', roll: 'Roll', orbit: 'Orbit', crash: 'Crash zoom', handheld: 'Handheld', shake: 'Shake' };
const voiceName = (id) => ELEVENLABS_VOICES.find((v) => v.id === id)?.name || ELEVENLABS_VOICES[0].name;
const narration = (story) => story.scenes.map((scene) => (scene.say || scene.text)).join(' ');
const themesOf = (story) => [...new Set([...Object.keys(story.background || {}).filter((k) => story.background[k]?.top || story.background[k]?.image), 'paper', 'dusk', 'night'])];
const sceneStatus = (scene, busy, error) => (error || scene.codeError ? 'gagal' : !scene.code ? (busy ? 'menunggu' : 'belum') : scene.redraw ? 'ulang' : 'jadi');
const STATUS = {
  jadi: { label: 'ready', dot: 'bg-emerald-500' }, ulang: { label: 'will redraw', dot: 'bg-amber-500' },
  belum: { label: 'not drawn yet', dot: 'bg-[#c5c7d4]' }, menunggu: { label: 'waiting to draw', dot: 'animate-pulse bg-[#5b45f2]' }, gagal: { label: 'draw failed', dot: 'bg-rose-500' },
};

// Width that the user can drag (kept per browser).
function useResizable(key, initial, min, max) {
  const [width, setWidth] = useState(initial);
  useEffect(() => { try { const w = Number(window.localStorage.getItem(key)); if (w >= min && w <= max) setWidth(w); } catch { /* storage unavailable */ } }, [key, min, max]);
  const start = (event, side = 1) => {
    event.preventDefault();
    const x0 = event.clientX, w0 = width;
    let latest = w0;
    const move = (e) => {
      latest = Math.min(max, Math.max(min, w0 + (e.clientX - x0) * side));
      setWidth(latest);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { window.localStorage.setItem(key, String(latest)); } catch { /* storage unavailable */ }
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const reset = () => {
    setWidth(initial);
    try { window.localStorage.setItem(key, String(initial)); } catch { /* storage unavailable */ }
  };
  return [width, start, reset];
}

function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5e5e72]">{label}{hint ? <span className="ml-1.5 font-normal normal-case tracking-normal text-[#7a7b90]">{hint}</span> : null}</span>
      {children}
    </label>
  );
}
const inputClass = 'w-full rounded-xl border border-[#e6e7f0] bg-[#fafafd] px-3 py-2 text-[13px] leading-relaxed text-[#14141f] outline-none transition placeholder:text-[#8a8b9e] focus:border-[#5b45f2] focus:bg-white focus:ring-2 focus:ring-[#5b45f2]/12 disabled:opacity-60';

function Icon({ d, size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
function Badge({ children, tone = 'default' }) {
  const tones = {
    default: 'bg-[#f3f4f8] text-[#5e5e72] border border-[#e6e7f0]',
    accent: 'bg-[#f2f0ff] text-[#4c38d6] border border-[#ddd7fe]',
    green: 'bg-[#ecfdf3] text-[#147a49] border border-[#c5f0d6]',
    amber: 'bg-[#fff8eb] text-[#a05c07] border border-[#fce0b0]',
    red: 'bg-[#fff1f3] text-[#c01048] border border-[#fccdd6]',
  };
  return <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-semibold ${tones[tone] || tones.default}`}>{children}</span>;
}
function Spinner() {
  return <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#ddd7fe] border-t-[#5b45f2]" aria-hidden="true" />;
}

const CARD_ICON_PATHS = {
  brief: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8',
  script: 'M12 20h9 M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z',
  scene: 'M3 5h18v14H3z M9 5v14 M15 5v14',
  plan: 'M5 3l14 9-14 9V3z',
  idea: 'M9 18h6 M10 22h4 M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z',
};

// A card in the chat, matching AI Director's card shell.
function CardShell({ iconKey = 'brief', title, accent, children, actions }) {
  return (
    <div className="w-full max-w-[440px]">
      <div className="rounded-2xl border border-[#e6e7f0] bg-white p-2 shadow-[0_4px_18px_rgba(20,20,31,0.04)]">
        <div className="flex min-w-0 items-center gap-2.5 px-2 pb-2 pt-1">
          <span className="grid h-7 w-7 flex-none place-items-center rounded-xl bg-[#f2f0ff] border border-[#ddd7fe] text-[#5b45f2]">
            <Icon d={CARD_ICON_PATHS[iconKey] || CARD_ICON_PATHS.brief} size={13} />
          </span>
          <span className="truncate text-[13px] font-semibold text-[#14141f]">
            {title}
            {accent && <span className="font-medium text-[#5b45f2]"> · {accent}</span>}
          </span>
        </div>
        <div className="rounded-xl border border-[#efeff5] bg-[#fafafd] p-3">{children}</div>
      </div>
      {actions && <div className="mt-2 flex gap-2">{actions}</div>}
    </div>
  );
}
const pillButton = 'flex-1 rounded-full border border-[#e6e7f0] bg-white py-2 text-[12.5px] font-semibold text-[#2d2e3f] hover:border-[#c8bffb] hover:bg-[#f2f0ff] hover:text-[#4c38d6] transition-colors disabled:opacity-50';
const acceptButton = 'flex-1 rounded-full bg-[#5b45f2] hover:bg-[#4731d8] py-2 text-[12.5px] font-semibold text-white shadow-[0_4px_14px_rgba(91,69,242,0.24)] transition-all disabled:opacity-40';

function Message({ message, story, onPick, onOpen, busy }) {
  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1.5">
        {message.attachments?.length > 0 && (
          <div className="flex max-w-[78%] flex-wrap justify-end gap-1.5">
            {message.attachments.map((a) => (
              <span key={a.key} title={a.name || a.key} className="relative h-16 w-16 overflow-hidden rounded-xl border border-[#e6e7f0] bg-[#f3f4f8] shadow-xs">
                {a.type === 'image'
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={a.url} alt={a.name || a.key} className="h-full w-full object-cover" />
                  : <video src={`${a.url}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />}
                {a.type === 'video' && <span className="absolute bottom-0.5 left-0.5 rounded bg-[#14141f]/75 px-1 text-[9px] text-white">Video</span>}
              </span>
            ))}
          </div>
        )}
        <div className="max-w-[78%] whitespace-pre-line break-words rounded-2xl rounded-br-md border border-[#ddd7fe] bg-[#f2f0ff] px-3.5 py-2.5 text-[13.5px] leading-[1.6] text-[#14141f]">{message.content}</div>
      </div>
    );
  }
  if (message.error) return <p className="rounded-xl border border-[#fccdd6] bg-[#fff1f3] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#c01048]">{message.content}</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-[#f1f1f4] px-4 py-3 text-[13.5px] leading-[1.7] text-[#2d2e3f]"><Rich text={message.content} /></div>
      {message.credits > 0 && <span className="-mt-1.5 pl-1 text-[11px] text-[#7a7b90]">{message.credits} credits</span>}
      {message.cards?.map((card, i) => {
        const scene = card.kind === 'scene' ? story.scenes[Number(card.scene)] : null;
        return (
          <CardShell key={i} iconKey={card.kind || 'brief'} title={{ brief: 'Brief', script: 'Script', scene: `Scene ${Number(card.scene) + 1}`, plan: 'Production plan' }[card.kind]} accent={card.kind === 'script' ? `${story.scenes.length} ${story.scenes.length === 1 ? 'scene' : 'scenes'}` : ''}
            actions={<button type="button" onClick={() => onOpen(card)} className={pillButton}>View details</button>}>
            <p className="line-clamp-2 text-[13px] font-semibold text-[#14141f]">{card.title || story.title || 'View details'}</p>
            {card.kind === 'brief' && story.brief && <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed text-[#5e5e72]">{story.brief}</p>}
            {card.kind === 'script' && <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed text-[#5e5e72]">{story.scenes.map((sc) => sc.text).join(' ')}</p>}
            {scene && <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed text-[#5e5e72]">{scene.visual}</p>}
          </CardShell>
        );
      })}
      {message.ideas?.length > 0 && (
        <CardShell iconKey="idea" title="Ideas" accent={`${message.ideas.length} options`}>
          <ul className="flex flex-col gap-2">
            {message.ideas.map((idea, i) => (
              <li key={i}>
                <button type="button" disabled={busy} onClick={() => onPick(i, idea)}
                  className="w-full rounded-xl border border-[#e6e7f0] bg-white px-3 py-2.5 text-left transition hover:border-[#c8bffb] hover:bg-[#f2f0ff]/60 disabled:opacity-50">
                  <span className="block text-[12.5px] font-semibold text-[#14141f]">{i + 1}. {idea.title}</span>
                  <span className="mt-0.5 block text-[12px] italic text-[#5e5e72]">“{idea.hook}”</span>
                  {idea.angle && <span className="mt-0.5 block text-[11px] text-[#7a7b90]">{idea.angle}</span>}
                </button>
              </li>
            ))}
          </ul>
        </CardShell>
      )}
    </div>
  );
}

// The plan to approve, as an approval card like the AI Director's.
function PlanNotice({ story, onOpen, onApprove, disabled }) {
  const p = story.pending;
  if (!p) return null;
  const rows = [
    p.what.includes('voice') && ['Voiceover', p.breakdown?.voice], p.what.includes('music') && ['Music', p.breakdown?.music],
    p.what.includes('sounds') && ['Ambience / SFX', p.breakdown?.sounds], p.scenes?.length && [`Draw ${p.scenes.length} ${p.scenes.length === 1 ? 'scene' : 'scenes'}`, p.breakdown?.draw],
  ].filter(Boolean);
  return (
    <CardShell iconKey="plan" title="Production plan" accent="approval required"
      actions={<>
        <button type="button" onClick={() => onOpen({ kind: 'plan' })} className={pillButton}>View plan</button>
        <button type="button" disabled={disabled} onClick={onApprove} className={acceptButton}>Generate · {p.credits} credits</button>
      </>}>
      <div className="mb-2"><Badge tone="amber">Awaiting approval</Badge></div>
      <ul className="space-y-1">
        {rows.map(([label, credits]) => <li key={label} className="flex justify-between gap-2 text-[12px] text-[#5e5e72]"><span className="truncate">{label}</span><span className="flex-none font-medium text-[#7a7b90]">±{credits ?? '?'} cr</span></li>)}
      </ul>
      <p className="mt-2 pt-2 border-t border-[#efeff5] text-[12.5px] text-[#2d2e3f]">Estimated <strong className="text-[#4c38d6]">{p.credits} credits</strong></p>
    </CardShell>
  );
}

function SceneDetail({ story, index }) {
  const scene = story.scenes[index];
  if (!scene) return <p className="text-[#7a7b90]">This scene no longer exists.</p>;
  const cast = story.cast.filter((c) => scene.visual.toLowerCase().includes(c.name.toLowerCase()));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5 text-[11.5px] text-[#5e5e72]">
        <Badge>{scene.duration.toFixed(1)}s</Badge>
        <Badge>camera: {CAMERA_LABELS[scene.camera] || scene.camera}</Badge>
        <Badge>backdrop: {scene.theme}</Badge>
        {scene.emphasis && <Badge tone="accent">emphasis: {scene.emphasis}</Badge>}
      </div>
      <section className="rounded-xl border border-[#efeff5] bg-[#fafafd] p-3.5"><h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#7a7b90]">On-screen text</h4><p className="text-[14.5px] font-medium text-[#14141f]">{scene.text}</p></section>
      <section className="rounded-xl border border-[#efeff5] bg-[#fafafd] p-3.5"><h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#7a7b90]">Voiceover line</h4><p className="text-[13.5px] leading-relaxed text-[#2d2e3f]">{scene.say || scene.text}</p></section>
      <section className="rounded-xl border border-[#efeff5] bg-[#fafafd] p-3.5"><h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#7a7b90]">Visual &amp; motion</h4><p className="text-[13.5px] leading-relaxed text-[#2d2e3f]">{scene.visual}</p></section>
      {cast.length > 0 && <section className="rounded-xl border border-[#efeff5] bg-[#fafafd] p-3.5"><h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#7a7b90]">Characters</h4>{cast.map((c) => <p key={c.name} className="text-[13px] text-[#5e5e72]"><b className="text-[#14141f]">{c.name}</b>: {c.look}</p>)}</section>}
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
  const title = { brief: 'Brief', script: `Script · ${story.scenes.length} ${story.scenes.length === 1 ? 'scene' : 'scenes'}`, scene: `Scene ${Number(card.scene) + 1}`, plan: 'Production plan' }[card.kind];
  const Row = ({ k, v }) => (v ? <div className="grid grid-cols-[110px_1fr] gap-3 border-b border-[#efeff5] py-2.5 text-[13px]"><span className="font-medium text-[#7a7b90]">{k}</span><span className="text-[#14141f]">{v}</span></div> : null);
  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-[#e6e7f0] bg-white shadow-[0_4px_18px_rgba(20,20,31,0.04)]">
      <div className="flex items-center justify-between border-b border-[#efeff5] px-5 py-3.5">
        <span className="text-[14px] font-semibold text-[#14141f]">{title}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-xl text-[#5e5e72] hover:bg-[#f3f4f8] hover:text-[#14141f] transition-colors">
          <Icon d="M18 6L6 18 M6 6l12 12" size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-5 py-4 md:px-6"><div className="mx-auto max-w-[920px]">
        {(card.kind === 'brief' || card.kind === 'plan') && (
          <div className="mb-4">
            <Row k="Title" v={story.title} />
            <Row k="Brief" v={story.brief} />
            <Row k="Type" v={story.kind} />
            <Row k="Style" v={`${style.label} — ${style.look}`} />
            <Row k="Pace" v={`${pace.label} — ${pace.tone}`} />
            <Row k="Duration" v={story.scenes.length ? `±${seconds}s · ${story.scenes.length} ${story.scenes.length === 1 ? 'scene' : 'scenes'}` : ''} />
            <Row k="Narrator" v={`${voiceName(story.voiceId)}`} />
            <Row k="Music" v={story.music ? (story.musicPrompt || pace.music) : 'no music'} />
            <Row k="Palette" v={story.palette?.colors?.length ? <span className="flex flex-wrap items-center gap-1.5">{story.palette.colors.map((c) => <span key={c} title={c} className="h-4 w-4 rounded ring-1 ring-[#14141f]/15" style={{ background: c }} />)}{story.palette.note ? <span className="ml-1 text-[#5e5e72]">{story.palette.note}</span> : null}</span> : ''} />
            <Row k="Captions" v={story.caption ? `${{ bottom: 'bottom', top: 'top', middle: 'middle', none: 'no captions' }[story.caption.position]} · ${story.caption.font}${story.caption.box ? ' · boxed' : ''}` : ''} />
            <Row k="Visual style" v={story.artDirection} />
            <Row k="Characters" v={story.cast.filter((c) => c.kind !== 'prop').map((c) => `${c.name}: ${c.look}${c.code ? ' (designed)' : ''}`).join(' · ')} />
            <Row k="Props" v={story.cast.filter((c) => c.kind === 'prop').map((c) => `${c.name}: ${c.look}${c.code ? ' (designed)' : ''}`).join(' · ')} />
          </div>
        )}
        {card.kind === 'plan' && p && (
          <div className="mb-4 rounded-2xl border border-[#ddd7fe] bg-[#f2f0ff] p-4">
            <div className="mb-2 text-[13px] font-semibold text-[#14141f]">What will be generated</div>
            <div className="grid grid-cols-2 gap-1.5 text-[12.5px] text-[#2d2e3f]">
              {p.what.includes('voice') && <><span>Voiceover</span><span className="text-right font-medium">±{p.breakdown?.voice ?? '?'} credits</span></>}
              {p.what.includes('music') && <><span>Music</span><span className="text-right font-medium">±{p.breakdown?.music ?? '?'} credits</span></>}
              {p.what.includes('sounds') && <><span>Ambience / SFX</span><span className="text-right font-medium">±{p.breakdown?.sounds ?? '?'} credits</span></>}
              {p.scenes?.length > 0 && <><span>Draw {p.scenes.length} {p.scenes.length === 1 ? 'scene' : 'scenes'}</span><span className="text-right font-medium">±{p.breakdown?.draw ?? '?'} credits</span></>}
              <span className="pt-1.5 border-t border-[#ddd7fe] font-semibold text-[#14141f]">Total</span><span className="pt-1.5 border-t border-[#ddd7fe] text-right font-semibold text-[#4c38d6]">±{p.credits} credits</span>
            </div>
          </div>
        )}
        {card.kind === 'scene' && <SceneDetail story={story} index={Number(card.scene)} />}
        {(card.kind === 'script' || card.kind === 'plan') && (
          <ol className="flex flex-col gap-2.5">
            {story.scenes.map((scene, i) => {
              const drawn = card.kind === 'plan' && p?.scenes?.includes(i);
              return (
                <li key={i} className={`rounded-xl border border-[#e6e7f0] px-4 py-3 ${card.kind === 'plan' && !drawn ? 'bg-[#fafafd] opacity-60' : 'bg-[#fafafd]'}`}>
                  <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-[#7a7b90]"><span className="font-mono">#{i + 1} · {scene.duration.toFixed(1)}s</span>{card.kind === 'plan' && <Badge tone={drawn ? 'accent' : 'default'}>{drawn ? 'redraw' : 'keep'}</Badge>}</div>
                  <p className="text-[13.5px] font-medium text-[#14141f]"><span className="text-[11px] font-semibold uppercase tracking-wide text-[#5b45f2] mr-1.5">Narration</span>{scene.say || scene.text}</p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#5e5e72]"><span className="text-[11px] font-semibold uppercase tracking-wide text-[#7a7b90] mr-1.5">Visual</span>{scene.visual}</p>
                </li>
              );
            })}
          </ol>
        )}
      </div></div>
      {card.kind === 'plan' && p && (
        <div className="flex justify-end border-t border-[#efeff5] px-5 py-3">
          <button type="button" disabled={busy} onClick={onApprove} className="rounded-xl bg-[#5b45f2] hover:bg-[#4731d8] px-5 py-2 text-[13px] font-semibold text-white shadow-[0_4px_14px_rgba(91,69,242,0.24)] transition-all disabled:opacity-40">Generate · ±{p.credits} credits</button>
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
  const add = () => { const list = [...story.scenes]; list.splice(selected + 1, 0, { text: 'New narration line.', say: '', visual: 'Describe the scene visuals.', theme: themes[0], camera: 'push', emphasis: '', duration: 3, words: [], code: '', redraw: true }); onChange(list); onSelect(selected + 1); };
  if (!story.scenes.length) return <p className="p-4 text-[13px] text-[#7a7b90] leading-relaxed">No script yet. Ask AI in chat, e.g. &ldquo;write the script&rdquo;.</p>;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5">
      <ol className="flex max-h-[36%] min-h-[120px] flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1">
        {story.scenes.map((s, i) => {
          const st = STATUS[sceneStatus(s, busy, sceneErrors[i])];
          return (
            <li key={i}>
              <button type="button" onClick={() => onSelect(i)} className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-[12.5px] transition ${i === selected ? 'border-[#c8bffb] bg-[#f2f0ff] text-[#14141f] font-semibold' : 'border-[#efeff5] bg-[#fafafd] text-[#2d2e3f] hover:border-[#d5d7e4] hover:bg-[#f3f4f8]'}`}>
                <span className="w-5 font-mono text-[11px] text-[#7a7b90]">{i + 1}</span>
                <span className={`h-2 w-2 flex-none rounded-full ${st.dot}`} title={st.label} />
                <span className="min-w-0 flex-1 truncate">{s.text}</span>
                <span className="font-mono text-[11px] text-[#7a7b90]">{s.duration.toFixed(1)}s</span>
              </button>
            </li>
          );
        })}
      </ol>
      {scene && (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto custom-scrollbar pr-1">
          <div className="flex items-center justify-between pt-1 border-t border-[#efeff5]">
            <span className="text-[13.5px] font-semibold text-[#14141f]">Scene {selected + 1} <span className="font-normal text-[#7a7b90]">· {scene.duration.toFixed(1)}s</span></span>
            <Badge tone={{ jadi: 'green', ulang: 'amber', gagal: 'red' }[sceneStatus(scene, busy, sceneErrors[selected])] || 'default'}>{STATUS[sceneStatus(scene, busy, sceneErrors[selected])].label}</Badge>
          </div>
          {(scene.codeError || sceneErrors[selected]) && <p className="rounded-xl border border-[#fce0b0] bg-[#fff8eb] px-3 py-2 text-[12px] text-[#a05c07]">{scene.codeError || sceneErrors[selected]}</p>}
          <Field label="On-screen text"><textarea rows={2} value={scene.text} disabled={disabled} onChange={(e) => update({ text: e.target.value })} className={inputClass} /></Field>
          <Field label="Voiceover line" hint="same words; supports [tags], CAPS, ..."><textarea rows={2} value={scene.say} disabled={disabled} onChange={(e) => update({ say: e.target.value }, false)} className={inputClass} /></Field>
          <Field label="Visual & motion" hint={story.canvas === 2 ? 'including background' : ''}><textarea rows={4} value={scene.visual} disabled={disabled} onChange={(e) => update({ visual: e.target.value })} className={inputClass} /></Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Camera"><select value={scene.camera} disabled={disabled} onChange={(e) => update({ camera: e.target.value }, false)} className={inputClass}>{STORY_CAMERAS.map((c) => <option key={c} value={c}>{CAMERA_LABELS[c] || c}</option>)}</select></Field>
            {story.canvas !== 2 && <Field label="Backdrop"><select value={scene.theme} disabled={disabled} onChange={(e) => update({ theme: e.target.value })} className={inputClass}>{themes.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>}
          </div>
          <Field label="Emphasis word"><input value={scene.emphasis} disabled={disabled} onChange={(e) => update({ emphasis: e.target.value }, false)} className={inputClass} /></Field>
          <div className="flex flex-wrap gap-1.5 pt-1 text-[12px]">
            <button type="button" disabled={disabled} onClick={() => onAskAI(selected)} className="rounded-lg bg-[#5b45f2] hover:bg-[#4731d8] px-3 py-1.5 font-semibold text-white transition-colors disabled:opacity-40">Ask AI to edit</button>
            <button type="button" disabled={disabled} onClick={() => update({})} className="rounded-lg border border-[#e6e7f0] bg-white px-2.5 py-1.5 font-medium text-[#2d2e3f] hover:border-[#c8bffb] hover:bg-[#f2f0ff] hover:text-[#4c38d6] transition-colors">Redraw</button>
            <button type="button" disabled={disabled || selected === 0} onClick={() => move(-1)} className="rounded-lg border border-[#e6e7f0] bg-white px-2.5 py-1.5 text-[#2d2e3f] hover:bg-[#f3f4f8] disabled:opacity-35">↑</button>
            <button type="button" disabled={disabled || selected === story.scenes.length - 1} onClick={() => move(1)} className="rounded-lg border border-[#e6e7f0] bg-white px-2.5 py-1.5 text-[#2d2e3f] hover:bg-[#f3f4f8] disabled:opacity-35">↓</button>
            <button type="button" disabled={disabled} onClick={add} className="rounded-lg border border-[#e6e7f0] bg-white px-2.5 py-1.5 font-medium text-[#2d2e3f] hover:border-[#c8bffb] hover:bg-[#f2f0ff] hover:text-[#4c38d6] transition-colors">+ Scene</button>
            <button type="button" disabled={disabled || story.scenes.length < 3} onClick={remove} className="rounded-lg border border-[#fccdd6] bg-[#fff1f3] px-2.5 py-1.5 font-medium text-[#c01048] hover:bg-[#ffe4e8] disabled:opacity-35">Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AudioEditor({ story, onChange, disabled }) {
  const recorded = story.voice && story.voiceText === narration(story) && (!story.voiceFor || story.voiceFor === (story.voiceId || story.voiceFor));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto custom-scrollbar pr-1">
      <Field label="Narrator voice">
        <select value={story.voiceId || ELEVENLABS_VOICES[0].id} disabled={disabled} onChange={(e) => onChange({ voiceId: e.target.value })} className={inputClass}>
          {ELEVENLABS_VOICES.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.gender === 'male' ? 'male' : 'female'} · {v.description}</option>)}
        </select>
      </Field>
      <div className="rounded-xl border border-[#e6e7f0] bg-[#fafafd]">
        <div className="flex items-center justify-between border-b border-[#efeff5] px-3 py-2 text-[11px]"><span className="font-semibold uppercase tracking-[0.06em] text-[#5e5e72]">Voiceover script</span><span className={recorded ? 'font-semibold text-[#147a49]' : 'text-[#7a7b90]'}>{story.voice ? (recorded ? 'recorded' : 'needs re-recording') : 'not recorded'}</span></div>
        <ol className="flex flex-col px-3 py-2 text-[12.5px] leading-relaxed text-[#2d2e3f]">
          {story.scenes.length ? story.scenes.map((s, i) => <li key={i} className="flex gap-2 py-0.5"><span className="w-5 font-mono text-[11px] text-[#7a7b90]">{i + 1}</span><span>{s.say || s.text}</span></li>) : <li className="text-[#7a7b90]">No script yet.</li>}
        </ol>
      </div>
      <label className="flex items-center gap-2 text-[13px] font-medium text-[#14141f]"><input type="checkbox" checked={story.music} disabled={disabled} onChange={(e) => onChange({ music: e.target.checked })} className="h-4 w-4 accent-[#5b45f2]" /> Background music</label>
      {story.music && <Field label="Music prompt" hint="genre, mood, instruments, BPM, era"><textarea rows={4} value={story.musicPrompt} disabled={disabled} onChange={(e) => onChange({ musicPrompt: e.target.value })} className={inputClass} /></Field>}
      {story.musicTrack && <p className="text-[11.5px] text-[#5e5e72]">{story.musicFor === story.musicPrompt ? 'Music is up to date with this prompt.' : 'Prompt changed: music will be regenerated.'}</p>}
      {story.sounds?.length > 0 && (
        <div className="rounded-xl border border-[#e6e7f0] bg-[#fafafd] p-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5e5e72]">Custom ambience &amp; SFX</div>
          {story.sounds.map((x) => (
            <div key={x.key} className="flex items-start gap-2 border-b border-[#efeff5] py-2 text-[12px] last:border-0">
              <span className="flex-1 text-[#2d2e3f]"><b className="text-[#14141f]">{x.key}</b> · {x.kind === 'effect' ? 'effect' : x.scene === null ? 'full video ambience' : `scene ${x.scene + 1} ambience`} · {x.seconds}s<br /><span className="text-[#5e5e72]">{x.prompt}</span></span>
              <span className="text-[11px] text-[#7a7b90]">{x.url && x.madeFrom === x.prompt ? 'ready' : 'not generated'}</span>
              <button type="button" disabled={disabled} onClick={() => onChange({ sounds: story.sounds.filter((y) => y.key !== x.key) })} className="text-[11.5px] font-medium text-[#c01048] hover:underline">remove</button>
            </div>
          ))}
        </div>
      )}
      {Object.keys(story.assets || {}).length > 0 && (
        <div className="rounded-xl border border-[#e6e7f0] bg-[#fafafd] p-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5e5e72]">External images &amp; animations</div>
          {Object.entries(story.assets).map(([k, a]) => <p key={k} className="text-[12px] text-[#5e5e72]"><span className="font-mono font-semibold text-[#4c38d6]">{k}</span> {a.credit ? `· ${a.credit}` : ''}</p>)}
        </div>
      )}
    </div>
  );
}

const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function Lane({ label, color, children }) {
  return (
    <div className="flex h-7">
      <span className={`sticky left-0 z-20 inline-flex h-full w-[56px] flex-none items-center rounded-l-lg bg-[#f3f4f8] border-r border-[#e6e7f0] px-2 text-[10px] font-semibold uppercase tracking-wide ${color}`}>{label}</span>
      <div className="relative flex-1 rounded-r-lg bg-[#fafafd]">{children}</div>
    </div>
  );
}
function Block({ from, length, total, tone, title, onClick, children }) {
  return (
    <button type="button" title={title} onClick={onClick} style={{ left: `${(from / total) * 100}%`, width: `${(length / total) * 100}%` }}
      className={`absolute bottom-0.5 top-0.5 overflow-hidden rounded-md px-2 text-left text-[10.5px] font-medium leading-[22px] transition-colors ${tone}`}>
      <span className="pointer-events-none block truncate">{children}</span>
    </button>
  );
}

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
    <div className="rounded-2xl border border-[#e6e7f0] bg-white p-3 shadow-[0_2px_10px_rgba(20,20,31,0.03)]">
      <div className="mb-2 flex flex-wrap items-center gap-2 px-0.5">
        <button type="button" onClick={onToggle} aria-label={playing ? 'Pause' : 'Play'} className="grid h-8 w-8 place-items-center rounded-full bg-[#14141f] hover:bg-[#5b45f2] text-white transition-colors">
          {playing ? <Icon d="M8 5v14 M16 5v14" size={12} /> : <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z" /></svg>}
        </button>
        <span className="font-mono text-[12px] font-semibold text-[#14141f]">{fmtTime(now)}</span>
        <span className="font-mono text-[12px] text-[#7a7b90]">/ {fmtTime(total)}</span>
        <span className="ml-auto text-[11px] font-medium text-[#7a7b90]">Zoom</span>
        <button type="button" onClick={() => setZoom((z) => Math.max(1, z / 1.5))} disabled={zoom <= 1} className="grid h-6 w-6 place-items-center rounded-md text-[13px] text-[#5e5e72] hover:bg-[#f3f4f8] hover:text-[#14141f] disabled:opacity-35">−</button>
        <input type="range" min={1} max={6} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Timeline zoom" className="w-24 accent-[#5b45f2]" />
        <button type="button" onClick={() => setZoom((z) => Math.min(6, z * 1.5))} disabled={zoom >= 6} className="grid h-6 w-6 place-items-center rounded-md text-[13px] text-[#5e5e72] hover:bg-[#f3f4f8] hover:text-[#14141f] disabled:opacity-35">+</button>
        <button type="button" onClick={() => setZoom(1)} className="rounded-md px-2 py-0.5 text-[11px] font-medium text-[#5e5e72] hover:bg-[#f3f4f8] hover:text-[#14141f]">Fit</button>
      </div>
      <div className="overflow-x-auto overflow-y-hidden custom-scrollbar">
        <div className="relative" style={{ width: `${zoom * 100}%`, minWidth: '100%' }}>
          <div className="flex"><span className="sticky left-0 z-20 w-[56px] flex-none bg-white" />
          <div className="relative h-4 flex-1 cursor-pointer text-[10px] text-[#7a7b90]" onClick={seekAt}>
            {ticks.map((t) => <span key={t} className="absolute bottom-0 border-l border-[#d5d7e4] pl-1 leading-none" style={{ left: `${(t / total) * 100}%` }}>{fmtTime(t)}</span>)}
          </div></div>
          <div className="mt-1 flex"><span className="sticky left-0 z-20 inline-flex h-16 w-[56px] flex-none items-center whitespace-nowrap rounded-l-lg bg-[#f3f4f8] border-r border-[#e6e7f0] px-2 text-[9.5px] font-semibold uppercase text-[#5e5e72]">Scenes</span>
          <div className="flex h-16 flex-1 overflow-hidden rounded-r-lg border border-l-0 border-[#e6e7f0]">
            {story.scenes.map((s, i) => {
              const st = STATUS[sceneStatus(s, busy, sceneErrors[i])];
              return (
                <button key={i} type="button" onClick={() => onSelect(i)} title={`${i + 1}. ${s.text}`} style={{ width: `${(s.duration / total) * 100}%` }}
                  className={`relative flex h-full flex-none flex-col justify-between overflow-hidden border-r border-[#e6e7f0] px-2 py-1.5 text-left transition-colors ${i === selected ? 'bg-[#f2f0ff] ring-2 ring-inset ring-[#5b45f2]' : 'bg-[#fafafd] hover:bg-[#f3f4f8]'}`}>
                  <span className="flex items-center gap-1.5"><span className="rounded bg-white border border-[#e6e7f0] px-1.5 py-0.5 text-[10px] font-semibold text-[#14141f]">{i + 1}</span><span className={`h-2 w-2 rounded-full ${st.dot}`} title={st.label} /></span>
                  <span className="line-clamp-2 text-[10.5px] leading-tight text-[#5e5e72]">{s.text}</span>
                </button>
              );
            })}
          </div></div>
          <div className="mt-1.5 space-y-1">
            <Lane label="VO" color="text-[#4c38d6]">
              {story.scenes.map((s, i) => (
                <Block key={i} from={starts[i]} length={s.duration} total={total} onClick={() => onSelect(i)} title={`Scene ${i + 1} voiceover: ${s.say || s.text}`}
                  tone={voiceReady ? 'bg-[#ede9fe] text-[#4c38d6] border border-[#c8bffb] hover:bg-[#e0d8fe]' : 'border border-dashed border-[#c8bffb] bg-[#f8f7ff] text-[#5e5e72] hover:bg-[#f2f0ff]'}>{s.say || s.text}</Block>
              ))}
            </Lane>
            <Lane label="Music" color="text-[#0369a1]">
              {story.music
                ? <Block from={0} length={total} total={total} onClick={onOpenAudio} title={story.musicPrompt || 'Background music'}
                  tone={musicReady ? 'bg-[#e0f2fe] text-[#0369a1] border border-[#bae6fd] hover:bg-[#bae6fd]' : 'border border-dashed border-[#7dd3fc] bg-[#f0f9ff] text-[#0369a1] hover:bg-[#e0f2fe]'}>{story.musicPrompt || 'Background music'}</Block>
                : <button type="button" onClick={onOpenAudio} className="absolute left-1.5 top-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-[#5e5e72] hover:bg-[#efeff6] hover:text-[#14141f]">+ Add</button>}
            </Lane>
            <Lane label="SFX" color="text-[#a05c07]">
              {(story.sounds || []).filter((x) => x.kind !== 'effect').map((x) => {
                const whole = x.scene === null || !story.scenes[x.scene];
                const from = whole ? 0 : starts[x.scene];
                const length = whole ? total : story.scenes[x.scene].duration;
                return <Block key={x.key} from={from} length={length} total={total} onClick={onOpenAudio} title={x.prompt}
                  tone={x.url && x.madeFrom === x.prompt ? 'bg-[#fef3c7] text-[#a05c07] border border-[#fde68a] hover:bg-[#fde68a]' : 'border border-dashed border-[#fcd34d] bg-[#fffbeb] text-[#a05c07] hover:bg-[#fef3c7]'}>{x.key}</Block>;
              })}
              {!(story.sounds || []).some((x) => x.kind !== 'effect') && <span className="absolute left-2 top-1.5 text-[10.5px] text-[#7a7b90]">library sound effects play automatically per scene</span>}
            </Lane>
          </div>
          <div className="pointer-events-none absolute bottom-0 left-[56px] right-0 top-0 z-30">
            <div className="absolute bottom-0 top-0 w-0.5 bg-[#5b45f2] shadow-[0_0_6px_rgba(91,69,242,0.55)]" style={{ left: `${(Math.min(now, total) / total) * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Collapsible Secondary Sidebar (Matching AI Director)

function MotionSidebar({
  projects,
  currentId,
  agentStatus,
  boardOpen,
  onToggleBoard,
  onSelect,
  onNew,
  open,
  onCollapse,
  mobileOpen,
  onCloseMobile,
  busy,
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recentsOpen, setRecentsOpen] = useState(true);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => (p.firstTitle || p.name || '').toLowerCase().includes(q));
  }, [projects, query]);

  const statusText =
    agentStatus === 'running'
      ? 'Working…'
      : agentStatus === 'approval'
      ? 'Approval needed'
      : 'Ready';

  if (!open && !mobileOpen) {
    return <div className="dr-sidebar-collapsed hidden" aria-hidden="true" />;
  }

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#14141F]/30 backdrop-blur-[2px] md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        aria-label="AI Motion navigation"
        className={`dr-sidebar${mobileOpen ? ' is-mobile-open' : ''}${!open ? ' md:hidden' : ''}`}
      >
        {/* Top identity pill + collapse */}
        <div className="flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-[#F2F0FF] px-2.5 py-1.5">
            <span className="grid h-6 w-6 flex-none place-items-center rounded-lg bg-[#5B45F2] text-white shadow-[0_2px_6px_rgba(91,69,242,0.28)]">
              <Wand2 size={13} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <span className="min-w-0 truncate text-[11.5px] font-bold tracking-[0.02em] text-[#4C38D6]">
              AI MOTION
            </span>
            <span className="truncate text-[11px] font-medium text-[#6A5CE8]">{statusText}</span>
          </div>
          <button
            type="button"
            onClick={onCollapse}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            className="hidden h-7 w-7 flex-none place-items-center rounded-lg text-[#8A8B9C] transition hover:bg-[#F3F4F8] hover:text-[#14141F] md:grid"
          >
            <PanelLeftClose size={15} strokeWidth={1.9} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            title="Close project list"
            aria-label="Close project list"
            className="grid h-7 w-7 flex-none place-items-center rounded-lg text-[#8A8B9C] transition hover:bg-[#F3F4F8] hover:text-[#14141F] md:hidden"
          >
            <X size={15} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        {/* + New pill + Search toggle */}
        <div className="mt-3 flex items-center justify-between gap-1.5 px-0.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onNew();
              onCloseMobile();
            }}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition disabled:opacity-50 ${
              !currentId
                ? 'bg-[#EAEAF2] text-[#14141F]'
                : 'bg-[#F4F4F7] text-[#2C2D3A] hover:bg-[#EAEAF2] hover:text-[#14141F]'
            }`}
          >
            <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
            <span>New</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSearchOpen((v) => {
                if (v) setQuery('');
                return !v;
              });
            }}
            title="Search projects"
            aria-pressed={searchOpen}
            className={`grid h-7 w-7 place-items-center rounded-lg transition ${
              searchOpen
                ? 'bg-[#F2F0FF] text-[#5B45F2]'
                : 'text-[#8A8B9C] hover:bg-[#F3F4F8] hover:text-[#14141F]'
            }`}
          >
            <Search size={14} strokeWidth={1.9} aria-hidden="true" />
          </button>
        </div>

        {searchOpen && (
          <div className="mt-2 px-0.5">
            <div className="relative flex items-center">
              <Search size={13} className="pointer-events-none absolute left-2.5 text-[#8A8B9C]" aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects…"
                aria-label="Search AI Motion projects"
                className="w-full rounded-lg border border-[#E6E7F0] bg-[#FAFAFD] py-1.5 pl-8 pr-7 text-[12.5px] text-[#14141F] outline-none placeholder:text-[#9A9BAC] focus:border-[#5B45F2] focus:bg-white"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 text-[#8A8B9C] hover:text-[#14141F]"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Quick Board toggle when inside an active project */}
        {currentId && (
          <div className="mt-3 space-y-0.5 px-0.5">
            <button
              type="button"
              onClick={() => {
                onToggleBoard();
                onCloseMobile();
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium transition ${
                boardOpen
                  ? 'bg-[#F2F0FF] text-[#4C38D6]'
                  : 'text-[#2D2E3F] hover:bg-[#F3F4F8] hover:text-[#14141F]'
              }`}
            >
              <LayoutPanelLeft
                size={15}
                strokeWidth={1.85}
                className={`flex-none ${boardOpen ? 'text-[#5B45F2]' : 'text-[#6E6F82]'}`}
                aria-hidden="true"
              />
              <span className="flex-1 truncate">Video Board</span>
              {boardOpen && (
                <span className="h-1.5 w-1.5 flex-none rounded-full bg-[#5B45F2]" aria-hidden="true" />
              )}
            </button>
          </div>
        )}

        {/* Recents list */}
        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          <button
            type="button"
            onClick={() => setRecentsOpen((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1 text-[11.5px] font-medium text-[#8A8B9C] transition hover:text-[#2C2D3A]"
          >
            <span>Recents</span>
            <ChevronDown
              size={12}
              strokeWidth={2}
              className={`transition-transform ${recentsOpen ? '' : '-rotate-90'}`}
              aria-hidden="true"
            />
          </button>

          {recentsOpen && (
            <div className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-0.5 pb-2">
              {filtered.length === 0 ? (
                <p className="px-2 py-2 text-[12px] text-[#9A9BAC]">
                  {projects.length === 0 ? 'No projects yet.' : 'No matching projects.'}
                </p>
              ) : (
                filtered.map((project) => {
                  const active = project.id === currentId;
                  return (
                    <button
                      key={project.id}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        onSelect(project.id);
                        onCloseMobile();
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition disabled:opacity-60 ${
                        active
                          ? 'bg-[#F1F1F6] font-medium text-[#14141F]'
                          : 'text-[#3A3B4C] hover:bg-[#F5F5F9] hover:text-[#14141F]'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{project.firstTitle || project.name || NEW_NAME}</span>
                      {active && agentStatus === 'running' && <Spinner />}
                      {active && agentStatus === 'approval' && (
                        <span title="Awaiting approval" className="h-1.5 w-1.5 flex-none rounded-full bg-[#D97706]" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------- Root StoryStudio

export default function StoryStudio({
  authenticated = false,
  beforeGenerate = () => true,
  onCreditsUsed,
  onHeroChange = null,
}) {
  const prefersReducedMotion = useReducedMotion();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [ready, setReady] = useState(!authenticated);
  const [projectLoading, setProjectLoading] = useState(false);
  const [story, setStory] = useState(() => cleanStory({}));
  const [heroFormat, setHeroFormat] = useState('9:16');
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [heroFocused, setHeroFocused] = useState(false);
  const [heroDragging, setHeroDragging] = useState(false);
  const [tab, setTab] = useState('scenes');
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState(0);
  const [card, setCard] = useState(null);
  const [sceneErrors, setSceneErrors] = useState({});
  const [render, setRender] = useState(null);
  const [smooth, setSmooth] = useState(null);
  const [smoothRun, setSmoothRun] = useState(null);
  const [smoothTry, setSmoothTry] = useState(0);
  const videoRef = useRef(null);
  const seekAt = useRef(null);
  const [atBottom, setAtBottom] = useState(true);
  const [files, setFiles] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState('chat');
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const toggleRef = useRef(null);
  const [chatWidth, dragChat, resetChatWidth] = useResizable('nexoclip_motion_chat_w', 460, 360, 720);
  const [sideWidth, dragSide] = useResizable('nexoclip_motion_side_w', 320, 260, 480);
  const renderRef = useRef(null);
  const seekRef = useRef(null);
  const jobRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const busy = Boolean(job && (job.status === 'queued' || job.status === 'running'));
  const streaming = busy && String(job?.progress || '').startsWith('§') ? job.progress.slice(1) : '';

  const isHeroSurface = !ready || !projectId;
  useEffect(() => {
    onHeroChange?.(isHeroSurface);
  }, [isHeroSurface, onHeroChange]);
  useEffect(() => () => onHeroChange?.(true), [onHeroChange]);

  const openProject = useCallback(async (id, { silent = false } = {}) => {
    if (!silent) setProjectLoading(true);
    try {
      const { project, job: active } = await api(`/api/motion/projects/${id}`);
      const url = new URL(window.location.href);
      url.searchParams.delete('new');
      url.searchParams.set('project', id);
      window.history.replaceState(window.history.state, '', url);
      const nextStory = cleanStory(project.doc?.story);
      setProjectId(id);
      setStory(nextStory);
      setSceneErrors({});
      setSelected(0);
      setCard(null);
      setRender(null);
      setDirty(false);
      // Open Video Board automatically when the project already has drawn scenes or a script.
      const shouldShowBoard = nextStory.scenes.some((sc) => sc.code);
      if (!silent) {
        setBoardOpen(shouldShowBoard);
        setMobilePane(shouldShowBoard ? 'board' : 'chat');
      }
      try { window.localStorage.setItem(LAST_STORY_KEY, id); } catch { /* storage unavailable */ }
      if (active) { jobRef.current = active; setJob(active); }
    } finally {
      if (!silent) setProjectLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authenticated) {
      setReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { projects: all } = await api('/api/motion/projects');
        if (cancelled) return;
        const list = all.filter((p) => p.kind === 'story');
        setProjects(list);
        let last = null;
        try { last = window.localStorage.getItem(LAST_STORY_KEY); } catch { /* storage unavailable */ }
        const params = new URLSearchParams(window.location.search);
        if (!params.has('new')) {
          const id = params.get('project') || (last && list.some((p) => p.id === last) && last) || list[0]?.id;
          if (id) await openProject(id);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [authenticated, openProject]);

  // Auto-size active chat pill textarea
  useEffect(() => {
    if (!projectId) return;
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(26, Math.min(el.scrollHeight, 160))}px`;
  }, [text, projectId]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };
  const toBottom = (behavior = 'smooth') => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior });
  useLayoutEffect(() => { if (atBottom) toBottom('auto'); }, [story.chat.length, streaming, busy, story.pending]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the running job
  useEffect(() => {
    if (!busy) return undefined;
    let live = true;
    let timer;
    let lastRefresh = 0;
    const tick = async () => {
      try {
        const { job: nowJob } = await api(`/api/motion/jobs/${jobRef.current.id}`);
        if (!live) return;
        setJob(nowJob);
        if (nowJob.status === 'done' || nowJob.status === 'failed') {
          if (projectId) await openProject(projectId, { silent: true }).catch(() => {});
          if (projectId) api('/api/motion/projects').then(({ projects: all }) => setProjects(all.filter((p) => p.kind === 'story'))).catch(() => {});
          if (nowJob.credits > 0) onCreditsUsed?.();
          return;
        }
        if (projectId && /menggambar|suara|musik|draw|voice|music|audio/i.test(nowJob.progress || '') && Date.now() - lastRefresh > 2500) {
          lastRefresh = Date.now();
          const { project } = await api(`/api/motion/projects/${projectId}`);
          if (live) {
            const nextStory = cleanStory(project.doc?.story);
            setStory(nextStory);
            if (nextStory.scenes.some((sc) => sc.code)) setBoardOpen(true);
          }
        }
      } catch { /* next tick */ }
      if (live) timer = setTimeout(tick, String(jobRef.current?.progress || '').startsWith('§') ? 500 : 900);
    };
    timer = setTimeout(tick, 600);
    return () => { live = false; clearTimeout(timer); };
  }, [busy, projectId, openProject, onCreditsUsed]);

  const ensureProject = async (name) => {
    if (projectId) return projectId;
    const freshStory = cleanStory({ format: heroFormat });
    const { project } = await api('/api/motion/projects', {
      method: 'POST',
      body: JSON.stringify({ name: name.slice(0, 60) || NEW_NAME, doc: { kind: 'story', story: freshStory } }),
    });
    setProjects((list) => [project, ...list]);
    window.history.replaceState(window.history.state, '', '/studio/motion?project=' + project.id);
    setProjectId(project.id);
    setStory(freshStory);
    setBoardOpen(false);
    setMobilePane('chat');
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
    const readyFiles = files.filter((f) => f.id);
    if ((!message && !readyFiles.length) || busy || files.some((f) => f.uploading)) return;
    setText('');
    setFiles([]);
    run({ type: 'story-chat', message, attachments: readyFiles }, message || '(sent file)');
  };

  const attach = async (list) => {
    for (const file of [...list].slice(0, 6 - files.length)) {
      if (!/^(image|video)\//.test(file.type)) { setError('Only image and video files are supported.'); continue; }
      if (file.type.startsWith('video/') && file.size > 30 * 1024 * 1024) { setError('Reference video must be 30 MB or smaller.'); continue; }
      const temp = `${Date.now()}-${file.name}`;
      setFiles((f) => [...f, { temp, name: file.name, contentType: file.type, uploading: true, preview: URL.createObjectURL(file) }]);
      try {
        const form = new FormData();
        form.append('file', file);
        const response = await fetch('/api/uploads', { method: 'POST', body: form, credentials: 'include', headers: { 'x-workspace-id': window.sessionStorage.getItem('nexoclip_workspace_id') || '' } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Upload failed.');
        setFiles((f) => f.map((x) => (x.temp === temp ? { ...x, id: data.id, url: data.url, contentType: data.contentType || file.type, uploading: false } : x)));
      } catch (err) {
        setFiles((f) => f.filter((x) => x.temp !== temp));
        setError(err.message);
      }
    }
  };

  const produce = () => {
    setCard(null);
    setBoardOpen(true);
    run({ type: 'story-produce' });
  };

  const newStory = () => {
    window.history.replaceState(window.history.state, '', '/studio/motion?new=1');
    setProjectId(null);
    setStory(cleanStory({ format: heroFormat }));
    setJob(null);
    setError('');
    setSceneErrors({});
    setSelected(0);
    setCard(null);
    setRender(null);
    setDirty(false);
    setBoardOpen(false);
    setMobilePane('chat');
  };

  const openDetailCard = (nextCard) => {
    setCard(nextCard);
    setBoardOpen(true);
    setMobilePane('board');
  };

  const edit = (patch) => { setStory((s) => ({ ...s, ...patch, pending: null })); setDirty(true); };
  const saveAndPlan = async () => {
    if (!projectId) return;
    setError('');
    try {
      await api(`/api/motion/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify({ doc: { kind: 'story', story } }) });
      setDirty(false);
      const { pending } = await api('/api/motion/story', { method: 'POST', body: JSON.stringify({ projectId, type: 'story-plan' }) });
      setStory((s) => ({ ...s, pending }));
      if (pending) openDetailCard({ kind: 'plan' }); else setError('Nothing needs to be regenerated.');
    } catch (err) { setError(err.message); }
  };

  const selectScene = (i) => {
    setSelected(i);
    setTab('scenes');
    const start = story.scenes.slice(0, i).reduce((sum, s) => sum + s.duration, 0);
    seekAt.current?.(start + 0.05);
  };
  const askAI = (i) => { setText(`Scene ${i + 1}: `); inputRef.current?.focus(); };
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
        else setSmoothTry((n) => n + 1);
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
  const downloading = Boolean(render && !render.url && !render.error);
  useEffect(() => {
    if (!hasVideo || busy || dirty || smoothReady || downloading) return undefined;
    const timer = setTimeout(() => { setSmoothRun({ progress: 0 }); renderRef.current?.('preview'); }, 2500);
    return () => clearTimeout(timer);
  }, [storyKey, hasVideo, busy, dirty, smoothReady, downloading, smoothTry]);
  useEffect(() => () => { renderRef.current?.('cancel'); }, [storyKey]);
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

  const progressLine = busy && !streaming ? (job.progress || 'Waiting in queue…') : '';
  const style = drawStyleOf(story.styleSpec || story.style);
  const rendering = render && !render.url && !render.error;
  const canSend = !busy && (text.trim() || files.some((f) => f.id)) && !files.some((f) => f.uploading);
  const agentStatus = busy ? 'running' : story.pending ? 'approval' : 'idle';
  const projectCredits = Math.round(story.chat.reduce((sum, m) => sum + (Number(m.credits) || 0), 0) * 10) / 10;

  if (!ready) {
    return <NxDirectorSkeleton variant="full" label="Loading AI Motion" surface="light" />;
  }

  return (
    <div className="director-ui flex h-full min-h-0 w-full overflow-hidden bg-white">
      <MotionSidebar
        projects={projects}
        currentId={projectId}
        agentStatus={agentStatus}
        boardOpen={boardOpen}
        onToggleBoard={() => setBoardOpen((v) => !v)}
        onSelect={(id) => openProject(id).catch((err) => setError(err.message))}
        onNew={newStory}
        open={sidebarOpen}
        onCollapse={() => setSidebarOpen(false)}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        busy={busy}
      />

      {!projectId ? (
        /* ── NEW PROJECT HERO (Matched 1:1 with AI Director & Studio Home DotGrid Hero) ── */
        <div className="dr-hero-stage relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="relative z-10 flex h-12 flex-none items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Open project list"
                className="dr-hero-icon-btn md:hidden"
              >
                <PanelLeftOpen size={17} strokeWidth={1.9} />
              </button>
              {!sidebarOpen && (
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  title="Open AI Motion sidebar"
                  aria-label="Open AI Motion sidebar"
                  className="dr-hero-icon-btn hidden md:grid"
                >
                  <PanelLeftOpen size={17} strokeWidth={1.9} />
                </button>
              )}
            </div>
            <div />
          </div>

          <div className="dr-hero-scroll relative z-10">
            <section className="dr-hero-center" aria-labelledby="mt-hero-heading">
              {/* Segmented Aspect Ratio Tabs — identical to AI Director .dr-hero-tabs */}
              <div className="dr-hero-tabs" role="tablist" aria-label="Choose AI Motion video aspect ratio">
                {FORMAT_IDS.map((f) => {
                  const selectedFmt = heroFormat === f;
                  return (
                    <motion.button
                      key={f}
                      type="button"
                      role="tab"
                      aria-selected={selectedFmt}
                      whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                      onClick={() => setHeroFormat(f)}
                      className={`dr-hero-tab${selectedFmt ? ' is-active' : ''}`}
                    >
                      {selectedFmt && (
                        <motion.span
                          layoutId="mt-hero-tab-pill"
                          aria-hidden="true"
                          className="dr-hero-tab-pill"
                          transition={
                            prefersReducedMotion
                              ? { duration: 0 }
                              : { type: 'spring', stiffness: 420, damping: 32 }
                          }
                        />
                      )}
                      <span className="dr-hero-tab-inner">
                        <span>{f}</span>
                        <span className="hidden text-[12px] opacity-80 sm:inline">· {FORMATS[f].label}</span>
                      </span>
                    </motion.button>
                  );
                })}
              </div>

              <h1 id="mt-hero-heading" className="dr-hero-title">
                Describe the animated video you want to make.
              </h1>

              <div data-tour="motion-composer" className="w-full max-w-[704px]">
                <div
                  onDragOver={(e) => {
                    if (e.dataTransfer?.types?.includes('Files')) {
                      e.preventDefault();
                      setHeroDragging(true);
                    }
                  }}
                  onDragLeave={() => setHeroDragging(false)}
                  onDrop={(e) => {
                    if (e.dataTransfer?.files?.length) {
                      e.preventDefault();
                      setHeroDragging(false);
                      attach(e.dataTransfer.files);
                    }
                  }}
                  className={`dr-hero-composer relative${heroDragging ? ' is-dragging' : ''}`}
                >
                  {files.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2 px-1">
                      {files.map((f) => (
                        <div key={f.temp} title={f.name} className="relative h-14 w-14 overflow-hidden rounded-xl border border-[#DCDDE8] bg-[#11141C]">
                          {f.contentType.startsWith('image/')
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={f.preview} alt={f.name} className="h-full w-full object-cover" />
                            : <video src={f.preview} muted playsInline className="h-full w-full object-cover" />}
                          {f.contentType.startsWith('video/') && (
                            <span className="absolute bottom-1 left-1 inline-flex h-4 w-4 items-center justify-center rounded bg-black/75 text-white">
                              <Play size={8} fill="currentColor" aria-hidden="true" />
                            </span>
                          )}
                          {f.uploading && <span className="absolute inset-0 grid place-items-center bg-black/55 text-[10px] text-white">…</span>}
                          <button
                            type="button"
                            onClick={() => setFiles((list) => list.filter((x) => x.temp !== f.temp))}
                            aria-label={`Remove ${f.name}`}
                            className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/75 text-white hover:bg-black"
                          >
                            <X size={11} strokeWidth={2.4} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="relative w-full">
                    <textarea
                      ref={inputRef}
                      value={text}
                      onFocus={() => setHeroFocused(true)}
                      onBlur={() => setHeroFocused(false)}
                      onChange={(e) => setText(e.target.value.slice(0, 2000))}
                      rows={3}
                      disabled={busy}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          send();
                        }
                      }}
                      onPaste={(e) => {
                        if (e.clipboardData?.files?.length) {
                          e.preventDefault();
                          attach(e.clipboardData.files);
                        }
                      }}
                      placeholder={heroFocused ? 'Describe your video, attach reference images/videos, or paste a web link…' : ' '}
                      aria-label="Video brief for AI Motion"
                      className="block min-h-[76px] w-full resize-none bg-transparent px-2 pb-2.5 pt-0 text-[18px] leading-[1.5] text-[#14141F] outline-none placeholder:text-[#747387] max-md:text-[16px]"
                    />
                    {!text && !heroFocused && <MotionTypewriter phrases={EXAMPLES} />}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2">
                    <label
                      title="Attach reference images or videos (you can also paste or drag & drop here)"
                      className={`grid h-9 w-9 flex-none cursor-pointer place-items-center rounded-[8px] border border-[#E7E6F0] bg-white text-[#14141F] transition hover:border-[#D4CCFF] hover:bg-[#EDEAFF] hover:text-[#4731D8] ${
                        busy || files.length >= 6 ? 'pointer-events-none opacity-40' : ''
                      }`}
                    >
                      <Plus size={18} strokeWidth={2} aria-hidden="true" />
                      <input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { attach(e.target.files); e.target.value = ''; }} />
                    </label>

                    <div className="flex items-center gap-2">
                      <span className="hidden rounded-[8px] border border-[#E7E6F0] bg-[#FAFAFD] px-2.5 py-1.5 text-[12px] font-medium text-[#5E5E72] sm:inline-flex">
                        Auto style · {heroFormat}
                      </span>
                      <button
                        type="button"
                        onClick={() => send()}
                        disabled={!canSend}
                        aria-label="Start creating video with AI Motion"
                        title="Start (Enter)"
                        className="grid h-9 w-9 flex-none place-items-center rounded-[8px] bg-[#5B45F2] text-white transition hover:bg-[#4731D8] disabled:bg-[#F0EFF5] disabled:text-[#868599]"
                      >
                        {busy ? (
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                          <SendHorizontal size={16} strokeWidth={2.2} aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px] text-[#747387]">
                <span>AI suggests the style, pace, and voice, then writes the script &amp; draws every scene</span>
              </div>

              {/* Clickable quick-start examples */}
              <div className="mt-6 flex max-w-[704px] flex-wrap items-center justify-center gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    disabled={busy}
                    onClick={() => send(example)}
                    className="max-w-[330px] truncate rounded-full border border-[#E6E7F0] bg-white/92 px-3.5 py-2 text-left text-[12px] font-medium text-[#2D2E3F] shadow-[0_1px_4px_rgba(20,20,31,0.03)] transition hover:border-[#C8BFFB] hover:bg-[#F2F0FF] hover:text-[#4C38D6] disabled:opacity-50"
                    title={example}
                  >
                    {example}
                  </button>
                ))}
              </div>

              {error && (
                <p className="mt-4 w-full max-w-[704px] rounded-2xl border border-[#FCCDD6] bg-[#FFF1F3] px-4 py-2.5 text-[13px] text-[#C01048]">
                  {error}
                </p>
              )}
            </section>
          </div>
        </div>
      ) : projectLoading ? (
        <div className="flex h-full flex-1 bg-white">
          <NxDirectorSkeleton variant="project" label="Loading project" surface="light" />
        </div>
      ) : (
        /* ── ACTIVE PROJECT WORKSPACE (Matched 1:1 with AI Director ProjectWorkspace) ── */
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-white md:flex-row">
          {/* Mobile top bar: drawer + Chat / Board switch */}
          <div className="flex items-center gap-2 border-b border-[#EFEFF4] bg-white px-3 py-2 md:hidden">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open project list"
              className="grid h-8 w-8 flex-none place-items-center rounded-lg text-[#5E5E72] hover:bg-[#F3F4F8]"
            >
              <PanelLeftOpen size={17} strokeWidth={1.9} />
            </button>
            <div className="flex flex-1 rounded-xl bg-[#F4F4F8] p-0.5">
              {[
                ['chat', 'Chat'],
                ['board', story.scenes.length ? `Video (${story.scenes.length})` : 'Video'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setMobilePane(id);
                    if (id === 'board') setBoardOpen(true);
                  }}
                  className={`flex-1 rounded-lg py-1.5 text-[12.5px] font-semibold transition ${
                    mobilePane === id ? 'bg-white text-[#14141F] shadow-xs' : 'text-[#6E6F82]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Serene centered Chat Canvas (full-width when Board closed; resizable split when Board open) */}
          <section
            style={boardOpen ? { '--chat-width': `${chatWidth}px` } : undefined}
            className={`${mobilePane === 'chat' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col bg-white md:flex ${
              boardOpen ? 'md:w-[var(--chat-width)] md:flex-none md:border-r md:border-[#EAEAEF]' : ''
            }`}
          >
            {/* Whisper-quiet top bar */}
            <div className="hidden h-12 flex-none items-center justify-between px-4 md:flex">
              <div className="flex min-w-0 items-center gap-2">
                {!sidebarOpen && (
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(true)}
                    title="Open AI Motion sidebar"
                    aria-label="Open AI Motion sidebar"
                    className="grid h-8 w-8 flex-none place-items-center rounded-lg text-[#6E6F82] transition hover:bg-[#F3F4F8] hover:text-[#14141F]"
                  >
                    <PanelLeftOpen size={16} strokeWidth={1.9} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setBoardOpen((v) => !v)}
                  title={boardOpen ? 'Close Video Board' : 'Open Video Board (Preview, Timeline, Scenes)'}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition ${
                    boardOpen
                      ? 'border-[#DDD7FE] bg-[#F2F0FF] text-[#4C38D6]'
                      : 'border-[#E6E7F0] bg-white text-[#4C4D61] hover:border-[#C7CAD9] hover:bg-[#F7F8FA] hover:text-[#14141F]'
                  }`}
                >
                  <LayoutPanelLeft size={13.5} strokeWidth={2} aria-hidden="true" />
                  <span>Board</span>
                  {story.scenes.length > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10.5px] font-semibold ${
                        boardOpen ? 'bg-white/90 text-[#4C38D6]' : 'bg-[#F2F3F7] text-[#5E5E72]'
                      }`}
                    >
                      {story.scenes.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={newStory}
                  title="New project"
                  aria-label="New project"
                  className="grid h-8 w-8 place-items-center rounded-full text-[#6E6F82] transition hover:bg-[#F3F4F8] hover:text-[#14141F] disabled:opacity-45"
                >
                  <SquarePen size={15} strokeWidth={1.9} aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Scrollable centered conversation stream */}
            <div className="relative min-h-0 flex-1">
              <div ref={listRef} onScroll={onScroll} className="absolute inset-0 overflow-y-auto overscroll-contain custom-scrollbar px-5 pt-2 pb-10">
                <div className="mx-auto w-full max-w-[680px] space-y-4">
                  {/* Agent header matching AI Director */}
                  <div className="flex flex-col items-center pb-2 pt-3 text-center">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#F2F0FF] border border-[#DDD7FE] text-[#5B45F2] shadow-[0_4px_14px_rgba(91,69,242,0.12)]">
                      <Wand2 size={18} strokeWidth={2} aria-hidden="true" />
                    </span>
                    <h2 className="mt-2.5 text-[14.5px] font-semibold text-[#14141F]">{story.title || NEW_NAME}</h2>
                    <p className="mt-0.5 text-[12px] text-[#7A7B90]">
                      {[story.kind || 'AI Motion', totalSeconds ? `${totalSeconds}s` : '', story.scenes.length ? `${story.scenes.length} ${story.scenes.length === 1 ? 'scene' : 'scenes'}` : 'Ready to script & draw'].filter(Boolean).join(' · ')}
                    </p>
                  </div>

                  {story.chat.map((message, i) => (
                    <Message
                      key={i}
                      message={message}
                      story={story}
                      busy={busy}
                      onOpen={openDetailCard}
                      onPick={(n, idea) => send(`Use idea ${n + 1}: ${idea.title}`)}
                    />
                  ))}
                  {streaming && (
                    <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-[#f1f1f4] px-4 py-3 text-[13.5px] leading-[1.7] text-[#2d2e3f]">
                      <Rich text={streaming} />
                      <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-[#5b45f2] align-middle" />
                    </div>
                  )}
                  {!busy && !dirty && <PlanNotice story={story} onOpen={openDetailCard} onApprove={produce} disabled={busy} />}
                  {progressLine && <div className="flex items-center gap-2 text-[12.5px] text-[#5e5e72]"><Spinner /> {progressLine}</div>}
                  {error && <p className="rounded-xl border border-[#fccdd6] bg-[#fff1f3] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#c01048]">{error}</p>}
                </div>
              </div>
              {!atBottom && (
                <button
                  type="button"
                  onClick={() => { toBottom(); setAtBottom(true); }}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-[#e6e7f0] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#14141f] shadow-[0_8px_24px_rgba(20,20,31,0.12)] hover:border-[#c8bffb] hover:text-[#5b45f2]"
                >
                  ↓ Latest messages
                </button>
              )}
            </div>

            {/* Floating pill composer anchored cleanly at bottom center (matching AI Director) */}
            <div data-tour="motion-composer" className="dr-composer-fade flex-none px-5 pb-3.5 pt-3">
              <div className="mx-auto w-full max-w-[680px] space-y-2">
                {dirty && (
                  <p className="rounded-2xl border border-[#FCE0B0] bg-[#FFF8EB] px-3.5 py-2 text-[12px] font-medium text-[#A05C07]">
                    You have unsaved edits. Save them in the Board before messaging AI.
                  </p>
                )}
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); attach(e.dataTransfer.files); }}
                  className="dr-composer-pill relative rounded-[22px] border border-[#E6E7F0] bg-white px-2.5 py-2 transition focus-within:border-[#B9AEFC] focus-within:ring-4 focus-within:ring-[#5B45F2]/10"
                >
                  {files.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5 px-1">
                      {files.map((f) => (
                        <div key={f.temp} title={f.name} className="relative h-12 w-12 overflow-hidden rounded-xl border border-[#e6e7f0] bg-white">
                          {f.contentType.startsWith('image/')
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={f.preview} alt={f.name} className="h-full w-full object-cover" />
                            : <video src={f.preview} muted playsInline className="h-full w-full object-cover" />}
                          {f.uploading && <span className="absolute inset-0 grid place-items-center bg-[#14141f]/55 text-[10px] text-white">…</span>}
                          <button type="button" onClick={() => setFiles((list) => list.filter((x) => x.temp !== f.temp))} aria-label="Remove attachment"
                            className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-[#14141f]/80 text-[10px] text-white">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <label
                      title="Attach images or videos (you can also paste or drag & drop here)"
                      className={`mb-0.5 grid h-8 w-8 flex-none cursor-pointer place-items-center rounded-full text-[#6E6F82] transition hover:bg-[#F3F4F8] hover:text-[#14141F] ${
                        busy || files.length >= 6 ? 'pointer-events-none opacity-40' : ''
                      }`}
                    >
                      <Plus size={17} strokeWidth={2} aria-hidden="true" />
                      <input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { attach(e.target.files); e.target.value = ''; }} />
                    </label>
                    <textarea
                      ref={inputRef}
                      value={text}
                      onChange={(e) => setText(e.target.value.slice(0, 2000))}
                      rows={1}
                      disabled={busy}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                      onPaste={(e) => { if (e.clipboardData?.files?.length) { e.preventDefault(); attach(e.clipboardData.files); } }}
                      placeholder={busy ? 'Wait for AI Motion to finish…' : story.scenes.length ? 'e.g. change scene 3 to a campfire, make the narration calmer…' : 'Message AI Motion…'}
                      className="block max-h-40 min-h-[26px] flex-1 resize-none bg-transparent py-1.5 text-[14px] leading-[1.55] text-[#14141F] outline-none placeholder:text-[#9A9BAC]"
                    />
                    <button
                      type="button"
                      onClick={() => send()}
                      disabled={!canSend}
                      aria-label="Send message"
                      className="mb-0.5 grid h-8 w-8 flex-none place-items-center rounded-full bg-[#5B45F2] text-white shadow-[0_2px_8px_rgba(91,69,242,0.25)] transition hover:bg-[#4731D8] disabled:bg-[#F0EFF5] disabled:text-[#868599] disabled:shadow-none"
                    >
                      {busy ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : (
                        <SendHorizontal size={15} strokeWidth={2.2} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 px-2 text-[11.5px] text-[#8A8B9C]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#F59E0B]" aria-hidden="true" />
                    <span>{projectCredits} cr</span>
                    <span className="text-[#D4D3E0]">·</span>
                    <span>Style: {story.styleSpec ? style.label : 'AI selected'} · {story.format}</span>
                  </span>
                  <span className="hidden sm:inline">Enter to send · Shift+Enter for new line</span>
                </div>
              </div>
            </div>
          </section>

          {/* Draggable split resizer */}
          {boardOpen && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize chat width"
              title="Drag to resize chat width (double-click to reset)"
              onPointerDown={(e) => dragChat(e, 1)}
              onDoubleClick={resetChatWidth}
              className="dr-resizer hidden md:block"
            />
          )}

          {/* On-demand Video Board (Preview + Timeline + Scenes / Audio Inspector) */}
          {(boardOpen || mobilePane === 'board') && (
            <section
              data-tour="motion-preview"
              className={`${mobilePane === 'board' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col bg-[#F7F8FA] ${
                boardOpen ? 'md:flex' : 'md:hidden'
              }`}
            >
              <div className="flex items-center gap-2.5 overflow-x-auto border-b border-[#e6e7f0] bg-white px-4 py-3">
                <div className="min-w-0 pl-0.5">
                  <div className="truncate text-[14px] font-semibold text-[#14141f]">{story.title || NEW_NAME}</div>
                  <div className="truncate text-[11.5px] text-[#7a7b90]">{[story.kind, totalSeconds ? `${totalSeconds}s` : '', story.scenes.length ? `${story.scenes.length} ${story.scenes.length === 1 ? 'scene' : 'scenes'}` : ''].filter(Boolean).join(' · ') || 'No script yet'}</div>
                </div>
                <div className="ml-auto flex flex-none items-center gap-2">
                  {story.brief && <button type="button" onClick={() => setCard({ kind: 'brief' })} className="rounded-lg hover:opacity-85 transition-opacity"><Badge>Brief</Badge></button>}
                  {story.scenes.length > 0 && <button type="button" onClick={() => setCard({ kind: 'script' })} className="rounded-lg hover:opacity-85 transition-opacity"><Badge>Script</Badge></button>}
                  <span title="Drawing style" className="hidden sm:inline"><Badge tone="accent">{story.styleSpec ? style.label : 'Style: AI selected'}</Badge></span>
                  <label title="Video aspect ratio. Changing ratio redraws all scenes." className="relative flex items-center">
                    <select value={story.format} disabled={busy} onChange={(e) => edit({ format: e.target.value, scenes: story.scenes.map((sc) => ({ ...sc, redraw: true })) })}
                      className="h-8 cursor-pointer appearance-none rounded-xl border border-[#e6e7f0] bg-[#fafafd] pl-2.5 pr-7 text-[12px] font-medium text-[#2d2e3f] outline-none hover:border-[#c8bffb] focus:border-[#5b45f2]">
                      {FORMAT_IDS.map((f) => <option key={f} value={f}>{f} · {FORMATS[f].label}</option>)}
                    </select>
                    <svg className="pointer-events-none absolute right-2 text-[#7a7b90]" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6" /></svg>
                  </label>
                  {story.pending && !dirty && (
                    <button type="button" onClick={produce} disabled={busy} title="Review the plan in chat first; same as the Generate button on the plan card."
                      className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#5b45f2] hover:bg-[#4731d8] px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-[0_4px_14px_rgba(91,69,242,0.24)] transition-all disabled:opacity-40">
                      <Icon d="M5 3l14 9-14 9V3z" /> Generate · {story.pending.credits} cr
                    </button>
                  )}
                  {render?.url ? (
                    <a href={render.url} download={`${(story.title || 'animated-video').replace(/[^\w\- ]+/g, '').trim() || 'animated-video'}.mp4`}
                      className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#5b45f2] hover:bg-[#4731d8] px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-[0_4px_14px_rgba(91,69,242,0.24)] transition-all"><Icon d="M12 4v11 M7 10l5 5 5-5 M5 20h14" /> Download MP4</a>
                  ) : (
                    <button type="button" onClick={startRender} disabled={!hasVideo || busy || rendering}
                      title={render?.error ? `Render failed: ${render.error}` : `Render ${layoutOf(story.format).out.join('×')} MP4 in this browser (free). Keep this tab open.`}
                      className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#e6e7f0] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#14141f] hover:border-[#c8bffb] hover:bg-[#f2f0ff] hover:text-[#4c38d6] transition-all disabled:opacity-45">
                      <Icon d="M12 4v11 M7 10l5 5 5-5 M5 20h14" /> {rendering ? `Rendering… ${Math.round((render.progress || 0) * 100)}%` : render?.error ? 'Retry render' : 'Export MP4'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setBoardOpen(false);
                      setMobilePane('chat');
                    }}
                    title="Close Video Board"
                    aria-label="Close Video Board"
                    className="grid h-8 w-8 flex-none place-items-center rounded-lg text-[#6E6F82] transition hover:bg-[#F3F4F8] hover:text-[#14141F]"
                  >
                    <X size={15} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-3.5 md:p-4 xl:flex-row xl:overflow-hidden">
                <div className="flex min-h-[70vh] min-w-0 flex-1 flex-col gap-3 xl:min-h-0">
                  {card && <DetailPanel card={card} story={story} onClose={() => setCard(null)} onApprove={produce} busy={busy} />}
                  <div className={`${card ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col gap-3`}>
                    <div className="relative flex min-h-[260px] min-w-0 flex-1 items-center justify-center overflow-hidden rounded-2xl border border-[#232838] bg-[#0f1117] shadow-[0_12px_32px_rgba(20,20,31,0.12)]">
                      <div className="relative h-full max-h-full" style={{ aspectRatio: { '9:16': '9 / 16', '4:5': '4 / 5', '1:1': '1 / 1', '16:9': '16 / 9' }[story.format] || '9 / 16', maxWidth: '100%' }}>
                        {hasVideo && smoothReady && (
                          // eslint-disable-next-line jsx-a11y/media-has-caption
                          <video ref={videoRef} key={smooth.url} src={smooth.url} controls playsInline className="absolute inset-0 z-10 h-full w-full bg-[#0f1117] object-contain"
                            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onSeeked={(e) => setNow(e.currentTarget.currentTime)} onTimeUpdate={(e) => { if (!playing) setNow(e.currentTarget.currentTime); }} />
                        )}
                        {hasVideo ? <StoryPreview story={story} onSceneError={onSceneError} renderRef={renderRef} seekRef={seekRef} toggleRef={toggleRef} onRender={onRender} onTime={smoothReady ? null : setNow} onPlaying={smoothReady ? null : setPlaying} /> : (
                          <div className="flex h-full flex-col items-center justify-center gap-2.5 p-8 text-center">
                            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.06] border border-white/10 text-white/60">
                              <Icon d="M5 3l14 9-14 9V3z" size={18} />
                            </div>
                            <p className="text-[14px] font-medium text-white/85">{story.scenes.length ? 'Script ready. Review the production plan in chat.' : 'Start from the chat on the left'}</p>
                            <p className="max-w-xs text-[12px] text-white/50">Preview appears as soon as the first scene finishes drawing.</p>
                          </div>
                        )}
                      </div>
                    </div>
                    {hasVideo && (
                      <div className="flex items-center gap-2 px-1 text-[11.5px] text-[#5e5e72]">
                        {smoothReady ? <><span className="h-2 w-2 rounded-full bg-emerald-500" /> Smooth preview (rendered video, half resolution)</>
                          : smoothRun ? <><Spinner /> Preparing smooth preview… {Math.round((smoothRun.progress || 0) * 100)}% · playing live meanwhile</>
                            : <><span className="h-2 w-2 rounded-full bg-amber-500" /> Playing live from drawings; smooth version renders automatically when done</>}
                      </div>
                    )}
                    <Timeline story={story} selected={selected} onSelect={selectScene} onSeek={seekTo} now={now} playing={playing} onToggle={togglePlay}
                      busy={busy} sceneErrors={sceneErrors} onOpenAudio={() => setTab('audio')} />
                  </div>
                </div>

                {/* Scenes and audio inspector */}
                <aside data-tour="motion-scenes" style={{ '--side-w': `${sideWidth}px` }} className="relative flex min-h-[60vh] w-full flex-none flex-col rounded-2xl border border-[#e6e7f0] bg-white shadow-[0_2px_10px_rgba(20,20,31,0.03)] xl:min-h-0 xl:w-[var(--side-w)]">
                  <div onPointerDown={(e) => dragSide(e, -1)} title="Drag to resize" className="absolute -left-2.5 bottom-0 top-0 hidden w-1.5 cursor-col-resize rounded-full hover:bg-[#5b45f2]/25 xl:block" />
                  <div className="flex items-center gap-1 border-b border-[#efeff5] p-2">
                    {[{ id: 'scenes', label: 'Scenes', count: story.scenes.length }, { id: 'audio', label: 'Audio' }].map((t) => (
                      <button key={t.id} type="button" onClick={() => setTab(t.id)}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-semibold transition-all ${tab === t.id ? 'bg-[#5b45f2] text-white shadow-xs' : 'text-[#5e5e72] hover:bg-[#f3f4f8] hover:text-[#14141f]'}`}>
                        {t.label}{t.count ? <span className={tab === t.id ? 'text-white/75' : 'text-[#7a7b90]'}>{t.count}</span> : null}
                      </button>
                    ))}
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col p-3.5">
                    {tab === 'scenes'
                      ? <ScenesEditor story={story} selected={Math.min(selected, Math.max(0, story.scenes.length - 1))} onSelect={selectScene} onChange={(scenes) => edit({ scenes })} disabled={busy} sceneErrors={sceneErrors} busy={busy} onAskAI={askAI} />
                      : <AudioEditor story={story} onChange={edit} disabled={busy} />}
                  </div>
                  {dirty && (
                    <div className="border-t border-[#efeff5] p-3.5">
                      <button type="button" disabled={busy} onClick={saveAndPlan} className="w-full rounded-xl bg-[#5b45f2] hover:bg-[#4731d8] py-2.5 text-[12.5px] font-semibold text-white shadow-[0_4px_14px_rgba(91,69,242,0.24)] transition-all disabled:opacity-40">Save &amp; view production plan</button>
                    </div>
                  )}
                </aside>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
