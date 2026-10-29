'use client';

// A drawn Motion video in Remotion: each scene is AI-written canvas code (sketch.js) over a themed background,
// with a typewriter caption timed to the spoken words, a camera move, a slide-in between scenes and the
// scene's sound cues. Scene: { text, words?: [{ w, s }], emphasis, theme, camera, duration, code }.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AbsoluteFill, Sequence, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
// @remotion/media's Audio plays in the preview, the server render and the in-browser render alike.
import { Audio } from '@remotion/media';
import { compileScene } from './sketch.js';
import { layoutOf } from './layout.js';
import { loadExtras } from './extras.js';
import { paceOf } from './story.js';
import { sfxPath } from './sfxLibrary.js';
import { DRAW_FPS, FONT_FAMILY, collectSfx, drawFrames, drawTimeline, paintScene, sceneWords } from './paint.js';

export { CAMERAS, DRAW_FPS, cameraAt, drawFrames, drawTimeline, paintScene, sceneWords } from './paint.js';

const FONT_FILE = 'motion-fonts/patrickhand.ttf';
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const easeOut = (x) => 1 - (1 - x) ** 3;

// A cue name's file in the sound library (sfxLibrary.js); `k` picks the variation, unknown names get a pop.
const sfxFile = (name, k) => staticFile(sfxPath(name, k) || sfxPath('pop', k));

// The handwriting font, icons, map and the video's pictures/Lottie files, before the first frame is drawn.
function useHandFont(assets) {
  const [ready, setReady] = useState(false);
  const released = useRef(false);
  const [handle] = useState(() => delayRender('Loading the font and the pictures'));
  useEffect(() => {
    let live = true;
    const release = () => { if (!released.current) { released.current = true; continueRender(handle); } };
    const loads = [loadExtras({ assets }).catch(() => {})];
    if (typeof FontFace !== 'undefined') {
      const font = new FontFace(FONT_FAMILY, `url(${staticFile(FONT_FILE)})`);
      loads.push(font.load().then((loaded) => { document.fonts.add(loaded); }).catch(() => {}));
    }
    Promise.all(loads).then(() => { if (live) setReady(true); release(); }); // new assets (a later message) load on top
    return () => { live = false; };
  }, [handle, assets]);
  return ready;
}

function SceneCanvas({ scene, run, lead, background, seed, ready, debug, pace, style, format, onError }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const ref = useRef(null);
  const [error, setError] = useState(null);
  const t = (frame - lead) / fps;
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas || !ready) return;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const L = layoutOf(format);
    ctx.setTransform(width / L.w, 0, 0, height / L.h, 0, 0);
    const err = paintScene(ctx, { scene, run: run.fn, t, background, seed, pace, style, format });
    const message = run.error || (err && String(err.message || err));
    if (message) onError?.(seed - 1, message);
    setError((prev) => (prev === message ? prev : message || null));
  }, [frame, ready, scene, run, t, background, seed, width, height, pace, style, format, onError]);
  const slide = lead ? easeOut(clamp(frame / lead, 0, 1)) : 1;
  return (
    <AbsoluteFill style={{ transform: `translateY(${(1 - slide) * 100}%)`, boxShadow: lead && slide < 1 ? '0 -12px 30px rgba(0,0,0,0.25)' : 'none' }}>
      <canvas ref={ref} width={width} height={height} style={{ width: '100%', height: '100%' }} />
      {debug && error ? <div style={{ position: 'absolute', top: 8, left: 8, right: 8, color: '#fff', background: '#b91c1c', font: '20px monospace', padding: 8 }}>{error}</div> : null}
    </AbsoluteFill>
  );
}

// `voice` is one narration for the whole video (scene words are timed against it); `music` plays under it.
// `soundtrack` replaces both (used to compare against a finished video's audio).
export default function DrawVideo({ scenes = [], background = null, voice = null, music = null, soundtrack = null, sfx = true, debug = false, pace = 'normal', style = 'krayon', format = '9:16', assets = null, onError = null }) {
  const { fps } = useVideoConfig();
  const ready = useHandFont(assets);
  const timeline = useMemo(() => drawTimeline(scenes, fps), [scenes, fps]);
  const runs = useMemo(() => timeline.map((scene) => {
    try { return { fn: compileScene(scene.code) }; } catch (err) { return { fn: null, error: `Scene code: ${err.message}` }; }
  }), [timeline]);
  const transition = paceOf(pace).transition;
  const lead = Math.round(transition * fps);
  const cues = useMemo(() => (sfx ? timeline.map((scene, i) => collectSfx(runs[i].fn, { dur: scene.dur, theme: scene.theme, seed: i + 1 })) : []), [sfx, timeline, runs]);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {timeline.map((scene, i) => {
        const before = i ? lead : 0;
        return (
          <Sequence key={i} from={scene.from - before} durationInFrames={scene.frames + before} layout="none">
            <SceneCanvas scene={scene} run={runs[i]} lead={before} background={background} seed={i + 1} ready={ready} debug={debug} pace={pace} style={style} format={format} onError={onError} />
          </Sequence>
        );
      })}
      {soundtrack ? <Audio src={soundtrack} /> : null}
      {!soundtrack && voice ? <Audio src={voice} /> : null}
      {!soundtrack && music ? <Audio src={music} volume={voice ? 0.18 : 0.5} loop /> : null}
      {sfx ? (() => {
        const uses = new Map(); // how often each cue has played, so repeats rotate through the variations
        return timeline.flatMap((scene, i) => {
        const at = (sec) => scene.from + Math.round(sec * fps);
        const words = sceneWords(scene, scene.dur);
        const auto = [
          ...(i ? [{ name: 'transition', time: -transition, gain: 0.45, pitch: 1 }] : []),
          { name: 'scene-boom', time: 0, gain: 0.3, pitch: 1 },
          ...words.map((w) => ({ name: 'word-tick', time: w.s, gain: 0.18, pitch: 1 })),
        ];
        return [...auto, ...(cues[i] || [])].map((cue, k) => {
          const n = uses.get(cue.name) || 0;
          uses.set(cue.name, n + 1);
          return (
            <Sequence key={`${i}-${k}`} from={Math.max(0, at(cue.time))} durationInFrames={Math.round(2.5 * fps)} layout="none">
              <Audio src={sfxFile(cue.name, n)} volume={clamp(cue.gain, 0, 1.5) * 0.7} playbackRate={clamp(cue.pitch, 0.5, 2)} />
            </Sequence>
          );
        });
        });
      })() : null}
    </AbsoluteFill>
  );
}
