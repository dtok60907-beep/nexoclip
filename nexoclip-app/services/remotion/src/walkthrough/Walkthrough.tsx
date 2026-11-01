import {AbsoluteFill, Audio, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, Easing} from 'remotion';
import {clamp, Cursor, usePop} from '../director/parts';
import {APP, FRAME, theme} from '../director/theme';

// A product walkthrough built from real screenshots of the local app (1600×816 CSS px,
// the same size as the app area in FRAME). Boxes come from the staging script's manifest.
export type Box = {x: number; y: number; w: number; h: number};
export type Point = {x: number; y: number};
export type Step = {
  shot: string; // public/stage/<shot>.png
  dur: number; // frames
  caption?: string; // numbered caption that starts at this step
  to?: Point; // cursor target during this step
  click?: boolean;
  type?: Box; // reveal this box of the shot like typing, over the previous shot
  cover?: string; // with type: hide the not-yet-typed part with this colour instead (previous shot differs)
  zoom?: Point & {scale: number}; // camera push-in during this step
  video?: {src: string; box: Box}; // real output played over the shot
};
export type Config = {
  kicker: string;
  title: [string, string]; // white part, accent part
  subtitle: string;
  url: string;
  steps: Step[];
  end: [string, string];
};

export const INTRO = 80;
const OUTRO = 75;
const FADE = 7;

export const center = (b: Box): Point => ({x: b.x + b.w / 2, y: b.y + b.h / 2});

const lastIndex = <T,>(xs: T[], pred: (x: T) => boolean) => {
  for (let k = xs.length - 1; k >= 0; k--) if (pred(xs[k])) return k;
  return -1;
};

export const timeline = (c: Config) => {
  let t = INTRO;
  const starts = c.steps.map((s) => {
    const at = t;
    t += s.dur;
    return at;
  });
  return {starts, end: t, total: t + OUTRO};
};

const Kicker: React.FC<{text: string; size?: number}> = ({text, size = 20}) => (
  <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: size, fontWeight: 700, letterSpacing: 3, color: 'rgba(255,255,255,.55)'}}>
    <span style={{width: 8, height: 8, borderRadius: 99, background: theme.accent, boxShadow: `0 0 14px ${theme.accent}`}} />
    {text.toUpperCase()}
  </div>
);

const Shot: React.FC<{name: string; style?: React.CSSProperties}> = ({name, style}) => (
  <Img src={staticFile(`stage/${name}.png`)} style={{position: 'absolute', left: 0, top: 0, width: APP.w, height: APP.h, ...style}} />
);

export const Walkthrough: React.FC<{config: Config}> = ({config}) => {
  const frame = useCurrentFrame();
  const {starts, end, total} = timeline(config);
  const steps = config.steps;
  const i = Math.max(0, lastIndex(starts, (s) => frame >= s));
  const step = steps[i];
  const local = frame - starts[i];

  // Cursor: one eased move per step that has a target; the click lands right after it arrives.
  const moves = steps.flatMap((s, k) => {
    if (!s.to) return [];
    const dur = Math.min(20, Math.round(s.dur * 0.45));
    const start = starts[k] + 4;
    return [{to: s.to, start, dur, click: s.click ? start + dur + 3 : undefined}];
  });

  // Camera: ease into the step's zoom, ease back out when the next step has none.
  const zoomOf = (k: number) => steps[k]?.zoom;
  const cur = zoomOf(i);
  const prev = zoomOf(i - 1);
  const ease = {...clamp, easing: Easing.inOut(Easing.cubic)};
  let scale = 1;
  let origin: Point = {x: APP.w / 2, y: APP.h / 2};
  if (cur) {
    scale = interpolate(local, [0, 24], [prev ? prev.scale : 1, cur.scale], ease);
    origin = cur;
  } else if (prev) {
    scale = interpolate(local, [0, 16], [prev.scale, 1], ease);
    origin = prev;
  }

  const enter = interpolate(frame, [INTRO - 12, INTRO + 10], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  const leave = interpolate(frame, [end - 4, end + 14], [1, 0], clamp);
  const titleO = interpolate(frame, [0, 12, INTRO - 18, INTRO - 4], [0, 1, 1, 0], clamp);
  const titlePop = usePop(4, 18);
  const endO = interpolate(frame, [end + 6, end + 20], [0, 1], clamp);
  const endPop = usePop(end + 6, 18);

  // Current shot cross-fades in over the previous one; a typing step reveals its box instead.
  const prevShot = i > 0 ? steps[i - 1].shot : null;
  const fadeIn = interpolate(local, [0, FADE], [0, 1], clamp);
  const typing = step.type && !step.cover ? step.type : undefined;
  const covering = step.type && step.cover ? step.type : undefined;
  const typed = step.type ? interpolate(local, [6, Math.round(step.dur * 0.7)], [0, 1], clamp) : 1;

  // Captions: each starts at its step and lasts until the next captioned step.
  const captioned = steps.map((s, k) => ({s, k})).filter(({s}) => s.caption);
  
  return (
    <AbsoluteFill style={{background: `radial-gradient(1200px 700px at 50% 0%, #1a2010 0%, ${theme.bg} 60%)`, fontFamily: theme.font}}>
      <Audio
        src={staticFile('director/music.mp3')}
        playbackRate={0.9}
        volume={(f) => {
          // Duck the bed while a real output with its own sound is playing.
          const ducked = steps.some((s, k) => s.video && f >= starts[k] - 6 && f < starts[k] + s.dur);
          const base = interpolate(f, [0, 15, total - 24, total - 1], [0, 0.55, 0.55, 0], clamp);
          return ducked ? Math.min(base, 0.12) : base;
        }}
      />

      {/* Title */}
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', opacity: titleO}}>
        <Kicker text={config.kicker} />
        <div style={{marginTop: 26, fontSize: 80, fontWeight: 800, letterSpacing: -2.4, color: '#fff', textAlign: 'center', transform: `translateY(${(1 - titlePop) * 30}px)`}}>
          {config.title[0]} <span style={{color: theme.accent}}>{config.title[1]}</span>
        </div>
        <div style={{marginTop: 22, fontSize: 30, color: theme.muted}}>{config.subtitle}</div>
      </AbsoluteFill>

      {/* Browser window with the real app */}
      <div
        style={{
          position: 'absolute', left: FRAME.x, top: FRAME.y, width: FRAME.w, height: FRAME.h, borderRadius: 16, overflow: 'hidden',
          background: '#1e1e22', boxShadow: '0 50px 100px rgba(0,0,0,.55)', border: '1px solid rgba(255,255,255,.08)',
          opacity: enter * leave, transform: `translateY(${(1 - enter) * 40}px) scale(${0.96 + enter * 0.04})`,
        }}
      >
        <div style={{height: FRAME.bar, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px'}}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} style={{width: 12, height: 12, borderRadius: 99, background: c}} />)}
          <div style={{marginLeft: 14, width: 460, height: 26, borderRadius: 7, background: '#2b2b30', color: '#9aa0a6', fontSize: 14, display: 'flex', alignItems: 'center', padding: '0 12px'}}>
            {config.url}
          </div>
        </div>
        <div style={{position: 'absolute', left: 0, top: FRAME.bar, width: APP.w, height: APP.h, overflow: 'hidden', background: '#000'}}>
          <div style={{position: 'absolute', inset: 0, transform: `scale(${scale})`, transformOrigin: `${origin.x}px ${origin.y}px`}}>
            {prevShot && (fadeIn < 1 || typing) && <Shot name={prevShot} />}
            {typing ? (
              <Shot
                name={step.shot}
                style={{
                  clipPath: `inset(${typing.y - 6}px ${APP.w - (typing.x + typing.w * typed) - 4}px ${APP.h - (typing.y + typing.h) - 6}px ${typing.x - 4}px)`,
                }}
              />
            ) : (
              <Shot name={step.shot} style={{opacity: prevShot ? fadeIn : 1}} />
            )}
            {covering && typed < 1 && (
              <div
                style={{
                  position: 'absolute', left: covering.x + covering.w * typed, top: covering.y - 4,
                  width: covering.w * (1 - typed) + 8, height: covering.h + 8, background: step.cover,
                }}
              />
            )}
            {steps.map((s, k) =>
              s.video ? (
                <Sequence key={k} from={starts[k]} durationInFrames={s.dur} layout="none">
                  <div style={{position: 'absolute', left: s.video.box.x, top: s.video.box.y, width: s.video.box.w, height: s.video.box.h, overflow: 'hidden', borderRadius: 6, opacity: k === i ? fadeIn : 1}}>
                    <OffthreadVideo src={staticFile(s.video.src)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                  </div>
                </Sequence>
              ) : null,
            )}
            <Cursor from={{x: APP.w * 0.62, y: APP.h * 0.55}} show={[INTRO + 6, end - 2]} moves={moves} />
          </div>
        </div>
      </div>

      {/* Numbered captions */}
      {captioned.map(({s, k}, n) => {
        const startF = starts[k];
        const next = captioned[n + 1];
        const endF = next ? starts[next.k] : end;
        const o = interpolate(frame, [startF, startF + 10, endF - 8, endF], [0, 1, 1, 0], clamp);
        if (o <= 0) return null;
        return (
          <div key={k} style={{position: 'absolute', left: 0, right: 0, top: 950, display: 'flex', justifyContent: 'center', opacity: o}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 16, fontSize: 32, fontWeight: 650, color: '#fff', transform: `translateY(${(1 - o) * 10}px)`}}>
              <span style={{width: 46, height: 46, borderRadius: 99, display: 'grid', placeItems: 'center', background: theme.accent, color: theme.accentInk, fontSize: 24, fontWeight: 800}}>{n + 1}</span>
              {s.caption}
            </div>
          </div>
        );
      })}

      {/* End card */}
      {endO > 0 && (
        <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', opacity: endO}}>
          <Kicker text={config.kicker} />
          <div style={{marginTop: 26, fontSize: 74, fontWeight: 800, letterSpacing: -2.2, color: '#fff', textAlign: 'center', transform: `scale(${0.94 + endPop * 0.06})`}}>
            {config.end[0]}<br /><span style={{color: theme.accent}}>{config.end[1]}</span>
          </div>
          <div style={{marginTop: 36, padding: '16px 34px', borderRadius: 99, background: theme.accent, color: theme.accentInk, fontSize: 30, fontWeight: 800}}>
            app.nexoclip.com
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
