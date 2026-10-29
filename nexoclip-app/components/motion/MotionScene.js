'use client';

// The Remotion composition behind the Motion studio preview. One scene: a title, a subtitle and a
// call to action, animated in the family of the chosen style (styles.js). Timings are in seconds,
// so every length plays the same intro and holds longer before the outro. A video is one or more
// scenes played one after another.

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Lottie } from '@remotion/lottie';
import { AbsoluteFill, Audio, Easing, Sequence, continueRender, delayRender, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { ENTRANCES, combine, layerMotion, sample, toStyle } from './animations';
import { lottieUrl, sanitizeLottie } from './lottieLibrary';
import { LOTTIE_SIZES, MAX_COUNT, TRANSITION_SECONDS, VISUAL_TYPES, chatTimes, countdownSeconds, formatRupiah, layerStarts, parseCount, sceneSfx } from './sceneKinds';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
// The length of the scene being drawn (the composition's length when there is one scene).
const SceneLength = createContext(null);
// Height kept free at the bottom for captions in the scene being drawn (px), so content does not run under them.
const CaptionRoom = createContext(0);

function useScene() {
  const frame = useCurrentFrame();
  const config = useVideoConfig();
  const { fps, width, height } = config;
  const durationInFrames = useContext(SceneLength) ?? config.durationInFrames;
  const u = Math.min(width, height) / 1080;
  const sec = frame / fps;
  // 0 → 1 over [from, to] seconds.
  const p = (from, to, easing = Easing.out(Easing.cubic)) => interpolate(sec, [from, to], [0, 1], { ...clamp, easing });
  const pop = (delay, config = { damping: 11, stiffness: 140 }) => spring({ frame: frame - delay * fps, fps, config });
  const outro = interpolate(frame, [durationInFrames - 0.45 * fps, durationInFrames - 1], [1, 0], clamp);
  return { frame, fps, durationInFrames, width, height, u, sec, p, pop, outro, portrait: height > width };
}

const titleSize = (text, u, base = 128) => {
  const length = Math.max(...String(text || '').split(/\s+/).map((word) => word.length), 1);
  const total = String(text || '').length;
  return base * u * Math.min(1, Math.pow(12 / Math.max(length * 1.3, total * 0.55, 12), 0.75));
};

// Words that rise out of a mask one after another.
function MaskWords({ text, start, gap = 0.08, style, upper }) {
  const { p } = useScene();
  const words = String(text || '').split(/\s+/).filter(Boolean);
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: '0.28em', ...style }}>
      {words.map((word, index) => {
        const t = p(start + index * gap, start + index * gap + 0.55, Easing.out(Easing.exp));
        return (
          <span key={index} style={{ overflow: 'hidden', display: 'inline-block', paddingBottom: '0.08em' }}>
            <span style={{ display: 'inline-block', transform: `translateY(${(1 - t) * 105}%)` }}>{upper ? word.toUpperCase() : word}</span>
          </span>
        );
      })}
    </span>
  );
}

// Words that spring in with a little overshoot and tilt.
function PopWords({ text, start, gap = 0.09, style }) {
  const { pop } = useScene();
  const words = String(text || '').split(/\s+/).filter(Boolean);
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: '0.25em', ...style }}>
      {words.map((word, index) => {
        const s = pop(start + index * gap, { damping: 9, stiffness: 160 });
        return (
          <span key={index} style={{ display: 'inline-block', transform: `scale(${s}) rotate(${(1 - s) * (index % 2 ? 14 : -14)}deg)` }}>{word}</span>
        );
      })}
    </span>
  );
}

// Characters typed out, with a scramble on the ones still arriving.
function TypeText({ text, start, cps = 26, scramble, cursor, style }) {
  const { sec, frame } = useScene();
  const chars = String(text || '');
  const shown = Math.max(0, Math.floor((sec - start) * cps));
  const glyphs = '#%&*+=<>/\\01ABXZ';
  let out = chars.slice(0, shown);
  if (scramble && shown < chars.length) {
    for (let i = shown; i < Math.min(chars.length, shown + 4); i += 1) {
      out += chars[i] === ' ' ? ' ' : glyphs[Math.floor(random(`${i}-${frame}`) * glyphs.length)];
    }
  }
  const blink = Math.floor(sec * 2) % 2 === 0;
  return (
    <span style={style}>
      {out}
      {cursor && <span style={{ opacity: blink || shown < chars.length ? 1 : 0, marginLeft: '0.05em' }}>▍</span>}
    </span>
  );
}

function Fade({ start, children, y = 24, style }) {
  const { p, u } = useScene();
  const t = p(start, start + 0.6);
  return <div style={{ ...style, opacity: t * (style?.opacity ?? 1), transform: `translateY(${(1 - t) * y * u}px) ${style?.transform || ''}` }}>{children}</div>;
}

function Cta({ text, start, look }) {
  const { pop, u } = useScene();
  if (!text) return null;
  const s = pop(start, { damping: 13, stiffness: 150 });
  return (
    <div style={{
      marginTop: 56 * u, padding: `${22 * u}px ${46 * u}px`, borderRadius: 999, fontSize: 36 * u, fontWeight: 700,
      transform: `scale(${s})`, opacity: Math.min(1, s * 1.4), letterSpacing: '0.01em', ...look,
    }}>{text}</div>
  );
}

function Stack({ children, style }) {
  const { outro, u } = useScene();
  const room = useContext(CaptionRoom);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: `0 ${80 * u}px ${room}px`, opacity: outro, ...style }}>
      {children}
    </AbsoluteFill>
  );
}

// A path drawn on over [from, to] seconds (pathLength=1 so any path works).
function Draw({ d, from, to, color, width, opacity = 1, linecap = 'round' }) {
  const { p } = useScene();
  const t = p(from, to, Easing.inOut(Easing.cubic));
  return <path d={d} pathLength={1} fill="none" stroke={color} strokeWidth={width} strokeLinecap={linecap} strokeLinejoin="round" strokeDasharray={1} strokeDashoffset={1 - t} opacity={opacity} />;
}

function Grain({ amount = 0.12 }) {
  const { frame } = useScene();
  const x = Math.floor(random(`gx${frame}`) * 200);
  const y = Math.floor(random(`gy${frame}`) * 200);
  return (
    <AbsoluteFill style={{
      opacity: amount, mixBlendMode: 'overlay', backgroundPosition: `${x}px ${y}px`,
      backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'160\' height=\'160\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
    }} />
  );
}

/* ---------------------------------------------------------------- families */

function Clean({ s, title, subtitle, cta, content }) {
  const { u, p, sec, width, height } = useScene();
  const { bg, fg, accent, muted } = s.palette;
  const size = titleSize(title, u, s.variant === 'bold' ? 150 : 124);
  const bar = p(0.9, 1.4, Easing.inOut(Easing.cubic));
  const calm = s.variant === 'calm';
  return (
    <AbsoluteFill style={{ background: bg, color: fg, fontFamily: s.font }}>
      {s.variant === 'blocks' && <>
        <div style={{ position: 'absolute', width: 520 * u, height: 520 * u, borderRadius: '50%', background: accent, left: -160 * u, top: interpolate(p(0, 1), [0, 1], [-600 * u, -140 * u]) }} />
        <div style={{ position: 'absolute', width: 380 * u, height: 380 * u, background: muted, right: interpolate(p(0.15, 1.1), [0, 1], [-500 * u, -90 * u]), bottom: 120 * u, transform: `rotate(${12 + sec * 6}deg)`, borderRadius: 40 * u }} />
      </>}
      {calm && <div style={{ position: 'absolute', left: '50%', top: '50%', width: 760 * u, height: 760 * u, marginLeft: -380 * u, marginTop: -380 * u, borderRadius: '50%', background: muted, opacity: 0.35 * p(0, 2), transform: `scale(${0.9 + Math.sin(sec * 0.8) * 0.04})` }} />}
      {!s.variant && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 10 * u, background: accent, transform: `scaleX(${p(0.2, 1.4)})`, transformOrigin: 'left' }} />}
      {content || <Stack>
        <div style={{ position: 'relative', fontSize: size, fontWeight: 700, lineHeight: 1.02, letterSpacing: s.variant === 'bold' ? '-0.03em' : '-0.02em', maxWidth: width * 0.86 }}>
          {s.variant === 'bold' && <div style={{ position: 'absolute', left: -20 * u, right: -20 * u, top: '18%', bottom: '8%', background: accent, transform: `scaleX(${bar})`, transformOrigin: 'left', zIndex: 0 }} />}
          <MaskWords text={title} start={calm ? 0.4 : 0.25} gap={calm ? 0.18 : 0.08} upper={s.variant === 'bold'}
            style={{ position: 'relative', color: fg, mixBlendMode: s.variant === 'bold' ? 'difference' : 'normal' }} />
        </div>
        {subtitle && <Fade start={calm ? 1.4 : 1} style={{ marginTop: 30 * u, fontSize: 42 * u, color: fg, opacity: 0.72, fontFamily: 'var(--font-sans), sans-serif', fontWeight: 500, maxWidth: Math.min(width, height * 1.4) * 0.8 }}>{subtitle}</Fade>}
        <Cta text={cta} start={calm ? 2.1 : 1.6} look={{ background: accent, color: s.variant === 'blocks' ? '#111' : bg, fontFamily: 'var(--font-sans), sans-serif' }} />
      </Stack>}
    </AbsoluteFill>
  );
}

function Pop({ s, title, subtitle, cta, content }) {
  const { u, sec, pop, p, width } = useScene();
  const { bg, fg, accent, muted } = s.palette;
  const blobs = [[0.12, 0.18, 220, accent], [0.86, 0.22, 160, muted], [0.18, 0.84, 180, muted], [0.84, 0.8, 240, accent], [0.5, 0.08, 90, fg]];
  return (
    <AbsoluteFill style={{ background: bg, color: fg, fontFamily: s.font, overflow: 'hidden' }}>
      {s.variant === 'burst' && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <svg width={1800 * u} height={1800 * u} viewBox="-100 -100 200 200" style={{ transform: `rotate(${sec * 18}deg) scale(${pop(0)})` }}>
            {Array.from({ length: 18 }, (_, i) => <path key={i} d="M0 0 L-9 -100 L9 -100 Z" fill={i % 2 ? accent : muted} opacity={0.25} transform={`rotate(${i * 20})`} />)}
          </svg>
        </AbsoluteFill>
      )}
      {s.variant === 'chart' && (
        <div style={{ position: 'absolute', bottom: 0, left: '8%', right: '8%', height: '30%', display: 'flex', alignItems: 'flex-end', gap: 22 * u, opacity: 0.9 }}>
          {[0.45, 0.7, 0.35, 0.9, 0.6, 1].map((h, i) => (
            <div key={i} style={{ flex: 1, height: `${h * 100 * pop(0.3 + i * 0.1, { damping: 14, stiffness: 120 })}%`, background: i % 2 ? muted : accent, borderRadius: `${16 * u}px ${16 * u}px 0 0` }} />
          ))}
        </div>
      )}
      {s.variant === 'iso' && [[0.16, 0.2], [0.82, 0.3], [0.2, 0.78], [0.8, 0.76]].map(([x, y], i) => {
        const k = pop(0.1 + i * 0.12);
        const c = 120 * u;
        return (
          <svg key={i} width={c * 2} height={c * 2.2} viewBox="0 0 100 110" style={{ position: 'absolute', left: `calc(${x * 100}% - ${c}px)`, top: `calc(${y * 100}% - ${c}px + ${Math.sin(sec * 2 + i) * 10 * u}px)`, transform: `scale(${k})` }}>
            <path d="M50 5 L95 30 L50 55 L5 30 Z" fill={i % 2 ? accent : muted} />
            <path d="M5 30 L50 55 L50 105 L5 80 Z" fill={i % 2 ? accent : muted} style={{ filter: 'brightness(0.8)' }} />
            <path d="M95 30 L50 55 L50 105 L95 80 Z" fill={i % 2 ? accent : muted} style={{ filter: 'brightness(0.65)' }} />
          </svg>
        );
      })}
      {!s.variant && blobs.map(([x, y, r, c], i) => (
        <div key={i} style={{ position: 'absolute', left: `calc(${x * 100}% - ${r * u / 2}px)`, top: `calc(${y * 100}% - ${r * u / 2}px)`, width: r * u, height: r * u, borderRadius: i === 4 ? 18 * u : '50%', background: c, transform: `scale(${pop(0.05 * i)}) translateY(${Math.sin(sec * 2.2 + i) * 14}px) rotate(${sec * 40 * (i % 2 ? 1 : -1)}deg)` }} />
      ))}
      {content || <Stack>
        <div style={{ fontSize: titleSize(title, u, 136), fontWeight: 700, lineHeight: 1, maxWidth: width * 0.86, textShadow: `${6 * u}px ${6 * u}px 0 ${s.variant === 'burst' ? muted : accent}` }}>
          <PopWords text={title} start={0.2} />
        </div>
        {subtitle && <Fade start={0.95} style={{ marginTop: 34 * u, fontSize: 44 * u, fontWeight: 600, fontFamily: 'var(--font-sans), sans-serif', background: s.variant === 'burst' ? muted : 'transparent', color: s.variant === 'burst' ? '#fff' : fg, padding: s.variant === 'burst' ? `${8 * u}px ${24 * u}px` : 0, transform: `rotate(${s.variant === 'burst' ? -2 : 0}deg)` }}>{subtitle}</Fade>}
        <Cta text={cta} start={1.5} look={{ background: s.variant === 'burst' ? accent : fg, color: s.variant === 'burst' ? '#111' : bg, fontFamily: 'var(--font-sans), sans-serif', boxShadow: `0 ${8 * u}px 0 ${muted}`, rotate: `${Math.sin(sec * 4) * 2 * p(1.5, 2)}deg` }} />
      </Stack>}
    </AbsoluteFill>
  );
}

function Paper({ s, title, subtitle, cta, content }) {
  const { u, p, pop, sec, width, height } = useScene();
  const { bg, fg, accent, muted } = s.palette;
  const shadow = `0 ${10 * u}px ${24 * u}px rgba(0,0,0,0.18)`;
  const layer = (i) => interpolate(p(0.05 + i * 0.12, 0.9 + i * 0.12, Easing.out(Easing.back(1.4))), [0, 1], [height * 0.5, 0]);
  return (
    <AbsoluteFill style={{ background: bg, color: fg, fontFamily: s.font, overflow: 'hidden' }}>
      {s.variant === 'notebook' && <>
        <AbsoluteFill style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${58 * u}px, ${muted}66 ${58 * u}px, ${muted}66 ${60 * u}px)`, opacity: p(0, 0.8) }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 120 * u, width: 4 * u, background: accent, opacity: 0.6, transform: `scaleY(${p(0.1, 1)})`, transformOrigin: 'top' }} />
      </>}
      {s.variant === 'hills' && [muted, accent, fg].map((c, i) => (
        <svg key={i} viewBox="0 0 100 40" preserveAspectRatio="none" style={{ position: 'absolute', left: -20, right: -20, width: 'calc(100% + 40px)', bottom: -2, height: `${30 - i * 7}%`, transform: `translateY(${layer(i)}px) translateX(${Math.sin(sec * 0.6 + i) * 8}px)`, filter: `drop-shadow(${shadow})` }}>
          <path d={['M0 40 L0 22 Q15 8 30 18 T60 14 T100 20 L100 40 Z', 'M0 40 L0 28 Q20 16 40 26 T75 22 T100 28 L100 40 Z', 'M0 40 L0 34 Q25 28 50 33 T100 32 L100 40 Z'][i]} fill={c} opacity={i === 2 ? 0.85 : 1} />
        </svg>
      ))}
      {!s.variant && [[0.08, 0.1, 300, 220, accent, -8], [0.7, 0.06, 260, 300, muted, 10], [0.12, 0.72, 240, 240, muted, 6], [0.68, 0.74, 320, 200, accent, -5]].map(([x, y, w, h, c, r], i) => (
        <div key={i} style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, width: w * u, height: h * u, background: c, borderRadius: i % 2 ? '46% 54% 38% 62%' : 18 * u, boxShadow: shadow, transform: `translateY(${layer(i)}px) rotate(${r + Math.sin(sec + i) * 2}deg)` }} />
      ))}
      {content || <Stack>
        <div style={{ background: s.variant === 'notebook' ? 'transparent' : '#fffdf8', padding: s.variant === 'notebook' ? 0 : `${44 * u}px ${56 * u}px`, borderRadius: 10 * u, boxShadow: s.variant === 'notebook' ? 'none' : shadow, transform: `rotate(${(1 - pop(0.25)) * -10 - 1.5}deg) scale(${pop(0.25)})`, maxWidth: width * 0.84 }}>
          <div style={{ fontSize: titleSize(title, u, 112), fontWeight: 700, lineHeight: 1.05, color: fg }}>{title}</div>
          {s.variant === 'notebook' && <svg width="100%" height={30 * u} viewBox="0 0 100 10" preserveAspectRatio="none"><Draw d="M2 6 Q30 2 50 6 T98 5" from={0.8} to={1.4} color={accent} width={2.2} /></svg>}
        </div>
        {subtitle && <Fade start={1} style={{ marginTop: 34 * u, fontSize: 40 * u, fontWeight: 600, fontFamily: 'var(--font-sans), sans-serif', color: fg, maxWidth: width * 0.8 }}>{subtitle}</Fade>}
        <Cta text={cta} start={1.55} look={{ background: accent, color: '#fff', boxShadow: shadow, borderRadius: 14 * u, fontFamily: 'var(--font-sans), sans-serif' }} />
      </Stack>}
    </AbsoluteFill>
  );
}

function Sketch({ s, title, subtitle, cta, content }) {
  const { u, p, sec, width, height, frame } = useScene();
  const { bg, fg, accent, muted } = s.palette;
  const v = s.variant;
  const chalk = v === 'chalk';
  const wobble = v === 'depth' || v === undefined ? Math.sin(Math.floor(frame / 4) * 1.7) * 0.6 : 0;
  const titleStyle = {
    fontSize: titleSize(title, u, v === 'brush' ? 124 : 116), fontWeight: v === 'oneline' ? 300 : 700, lineHeight: 1.05, color: fg,
    textShadow: v === 'depth' ? [1, 2, 3, 4, 5].map((k) => `${k * 2 * u}px ${k * 2 * u}px 0 ${accent}`).join(',') : chalk ? `0 0 ${3 * u}px ${fg}aa` : 'none',
    transform: `rotate(${wobble}deg)`, opacity: chalk ? 0.92 : 1,
  };
  return (
    <AbsoluteFill style={{ background: bg, color: fg, fontFamily: s.font, overflow: 'hidden' }}>
      {v === 'blueprint' && <AbsoluteFill style={{ backgroundImage: `linear-gradient(${muted}55 1px, transparent 1px), linear-gradient(90deg, ${muted}55 1px, transparent 1px), linear-gradient(${muted}22 1px, transparent 1px), linear-gradient(90deg, ${muted}22 1px, transparent 1px)`, backgroundSize: `${120 * u}px ${120 * u}px, ${120 * u}px ${120 * u}px, ${24 * u}px ${24 * u}px, ${24 * u}px ${24 * u}px`, opacity: p(0, 0.8) }} />}
      {v === 'board' && <div style={{ position: 'absolute', inset: 40 * u, border: `${14 * u}px solid ${muted}`, borderRadius: 18 * u, background: '#fff' }} />}
      {chalk && <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(255,255,255,0.08), transparent 70%)' }} />}
      {(chalk || v === 'archive') && <Grain amount={0.2} />}
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {v === 'blueprint' && <>
          <Draw d="M120 260 L880 260" from={0.2} to={0.9} color={accent} width={2} opacity={0.7} />
          <Draw d="M120 740 L880 740" from={0.35} to={1.05} color={accent} width={2} opacity={0.7} />
          <Draw d="M160 220 L160 780" from={0.5} to={1.1} color={accent} width={1.5} opacity={0.5} />
          <Draw d="M840 220 L840 780" from={0.6} to={1.2} color={accent} width={1.5} opacity={0.5} />
        </>}
        {v === 'oneline' && <Draw d="M-20 860 C120 800 160 700 300 730 S420 900 520 840 S640 690 760 720 S900 880 1020 820" from={0.1} to={2.2} color={fg} width={3} opacity={0.8} />}
        {v === 'ink' && <Draw d="M80 880 C240 840 300 900 480 860 S760 820 920 870" from={1.2} to={2} color={fg} width={4} />}
        {(v === 'depth' || v === undefined || v === 'board' || chalk) && <>
          <Draw d="M180 300 C120 180 380 120 520 150 C700 190 900 240 820 380" from={1.3} to={1.9} color={accent} width={6} opacity={0.9} />
          <Draw d="M90 860 l40 -40 l40 40 l40 -40 l40 40" from={1.6} to={2.1} color={muted} width={5} />
          <Draw d="M820 120 l30 60 l-60 0 z" from={1.8} to={2.3} color={muted} width={5} />
        </>}
      </svg>
      {content || <Stack>
        <div style={{ position: 'relative', maxWidth: width * 0.84 }}>
          {v === 'brush' && (
            <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ position: 'absolute', left: '-8%', top: '-12%', width: '116%', height: '124%' }}>
              <Draw d="M3 16 C25 9 60 21 97 13" from={0.1} to={0.7} color={accent} width={24} linecap="round" />
            </svg>
          )}
          <div style={{ position: 'relative', ...titleStyle, clipPath: v === 'brush' ? 'none' : `inset(0 ${(1 - p(0.25, 1.1, Easing.inOut(Easing.quad))) * 100}% 0 0)` }}>
            {v === 'brush' ? <Fade start={0.45} y={0}>{title}</Fade> : title}
          </div>
          {v !== 'brush' && v !== 'oneline' && (
            <svg viewBox="0 0 100 12" preserveAspectRatio="none" style={{ width: '100%', height: 30 * u, display: 'block', marginTop: 8 * u }}>
              <Draw d={v === 'blueprint' ? 'M0 6 L100 6 M0 2 L0 10 M100 2 L100 10' : 'M2 7 C20 3 45 10 60 6 S90 4 98 8'} from={1} to={1.5} color={accent} width={v === 'blueprint' ? 0.8 : 3} />
            </svg>
          )}
        </div>
        {subtitle && <Fade start={1.3} style={{ marginTop: 26 * u, fontSize: 42 * u, color: v === 'blueprint' ? muted : fg, opacity: 0.85, maxWidth: Math.min(width, height * 1.4) * 0.78 }}>
          {v === 'blueprint' ? <TypeText text={subtitle} start={1.3} /> : subtitle}
        </Fade>}
        <Cta text={cta} start={1.9} look={{
          background: 'transparent', color: chalk ? accent : fg, border: `${4 * u}px solid ${chalk ? accent : fg}`, borderRadius: v === 'blueprint' ? 0 : `${40 * u}px ${18 * u}px ${36 * u}px ${14 * u}px`,
          transform: `rotate(${v === 'blueprint' ? 0 : -1.5 + Math.sin(sec * 3) * 0.5}deg)`,
        }} />
      </Stack>}
    </AbsoluteFill>
  );
}

function Tech({ s, title, subtitle, cta, content }) {
  const { u, p, pop, sec, width, height, frame } = useScene();
  const { bg, fg, accent, muted } = s.palette;
  const v = s.variant;
  const dark = !['ui', 'browser', 'cursors'].includes(v);
  const glow = dark ? `0 0 ${18 * u}px ${accent}88` : 'none';
  const cursors = [['Rina', '#ff6b3d', 0.1, 0.25], ['Bima', '#3d8bff', 0.85, 0.3], ['Sari', '#22c55e', 0.2, 0.82]];
  const body = (
    <>
      <div style={{ fontSize: titleSize(title, u, dark ? 108 : 112), fontWeight: 700, lineHeight: 1.04, color: fg, textShadow: glow, letterSpacing: dark ? '0.02em' : '-0.02em', maxWidth: width * 0.84 }}>
        {dark ? <TypeText text={v === 'hud' ? title.toUpperCase() : title} start={0.3} scramble cursor={v === 'hud'} /> : <MaskWords text={title} start={0.35} />}
      </div>
      {subtitle && <Fade start={1.2} style={{ marginTop: 28 * u, fontSize: 38 * u, color: dark ? accent : '#5b6070', fontFamily: dark ? 'var(--font-mono), monospace' : 'inherit', letterSpacing: dark ? '0.08em' : 0, textTransform: dark ? 'uppercase' : 'none', maxWidth: Math.min(width, height * 1.4) * 0.8 }}>{subtitle}</Fade>}
      <Cta text={cta} start={1.7} look={dark
        ? { background: 'transparent', color: accent, border: `${3 * u}px solid ${accent}`, borderRadius: 6 * u, boxShadow: glow, fontFamily: 'var(--font-mono), monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }
        : { background: accent, color: '#fff', borderRadius: 14 * u, boxShadow: `0 ${10 * u}px ${30 * u}px ${accent}55` }} />
    </>
  );
  return (
    <AbsoluteFill style={{ background: bg, color: fg, fontFamily: s.font, overflow: 'hidden' }}>
      {dark && !v && <>
        <AbsoluteFill style={{ backgroundImage: `linear-gradient(${muted}66 1px, transparent 1px), linear-gradient(90deg, ${muted}66 1px, transparent 1px)`, backgroundSize: `${90 * u}px ${90 * u}px`, transform: `perspective(${900 * u}px) rotateX(55deg) translateY(${(sec * 60 * u) % (90 * u)}px) scale(2)`, transformOrigin: 'center 80%', opacity: 0.5 * p(0, 1), maskImage: 'linear-gradient(to top, black, transparent 70%)', WebkitMaskImage: 'linear-gradient(to top, black, transparent 70%)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, height: 4 * u, background: accent, boxShadow: `0 0 ${30 * u}px ${accent}`, top: `${((sec * 0.35) % 1) * 100}%`, opacity: 0.35 }} />
      </>}
      {v === 'hud' && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: 0.55 * p(0, 0.8) }}>
          {[760, 600, 900].map((r, i) => (
            <svg key={r} width={r * u} height={r * u} viewBox="0 0 100 100" style={{ position: 'absolute', transform: `rotate(${sec * (i % 2 ? -24 : 18)}deg)` }}>
              <circle cx="50" cy="50" r="48" fill="none" stroke={i === 1 ? accent : muted} strokeWidth={i === 1 ? 0.6 : 0.4} strokeDasharray={i === 2 ? '1 3' : '30 8 4 8'} />
            </svg>
          ))}
          {['SYS.OK', `T+${sec.toFixed(2)}`, 'LOCK ●', `${Math.floor(random(`h${Math.floor(frame / 6)}`) * 9000 + 1000)}`].map((t, i) => (
            <div key={i} style={{ position: 'absolute', fontFamily: 'var(--font-mono), monospace', fontSize: 22 * u, color: accent, [i < 2 ? 'top' : 'bottom']: 70 * u, [i % 2 ? 'right' : 'left']: 70 * u }}>{t}</div>
          ))}
        </AbsoluteFill>
      )}
      {v === 'ui' && [[0.08, 0.1, 340, 180], [0.62, 0.08, 300, 220], [0.06, 0.7, 280, 240], [0.64, 0.74, 330, 170]].map(([x, y, w, h], i) => {
        const k = pop(0.1 + i * 0.1, { damping: 14, stiffness: 170 });
        return (
          <div key={i} style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, width: w * u, height: h * u, background: '#fff', borderRadius: 22 * u, boxShadow: `0 ${16 * u}px ${40 * u}px rgba(20,22,28,0.12)`, transform: `scale(${k}) translateY(${Math.sin(sec * 1.6 + i) * 8 * u}px)`, padding: 22 * u, display: 'flex', flexDirection: 'column', gap: 12 * u }}>
            <div style={{ width: 60 * u, height: 60 * u, borderRadius: 16 * u, background: i % 2 ? accent : muted }} />
            <div style={{ height: 14 * u, width: '80%', borderRadius: 7 * u, background: muted }} />
            <div style={{ height: 14 * u, width: `${40 + i * 10}%`, borderRadius: 7 * u, background: muted, opacity: 0.6 }} />
          </div>
        );
      })}
      {v === 'browser' ? (
        <AbsoluteFill style={{ padding: 60 * u, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', height: '100%', background: '#fff', borderRadius: 26 * u, boxShadow: `0 ${30 * u}px ${80 * u}px rgba(0,0,0,0.15)`, overflow: 'hidden', transform: `translateY(${(1 - pop(0, { damping: 16, stiffness: 120 })) * height * 0.6}px)`, display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 64 * u, background: muted, display: 'flex', alignItems: 'center', gap: 12 * u, padding: `0 ${26 * u}px` }}>
              {['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} style={{ width: 18 * u, height: 18 * u, borderRadius: '50%', background: c }} />)}
              <span style={{ marginLeft: 20 * u, flex: 1, height: 34 * u, borderRadius: 17 * u, background: '#fff', opacity: 0.8 }} />
            </div>
            <div style={{ flex: 1, position: 'relative' }}>{content || <Stack>{body}</Stack>}</div>
          </div>
        </AbsoluteFill>
      ) : content || <Stack>{body}</Stack>}
      {v === 'cursors' && cursors.map(([name, color, x0, y0], i) => {
        const t = sec * 0.7 + i * 2;
        const x = (x0 + Math.sin(t) * 0.05 + (0.5 - x0) * p(1.2 + i * 0.2, 2.6 + i * 0.2) * 0.25) * width;
        const y = (y0 + Math.cos(t * 1.3) * 0.04 + (0.5 - y0) * p(1.2 + i * 0.2, 2.6 + i * 0.2) * 0.2) * height;
        return (
          <div key={name} style={{ position: 'absolute', left: x, top: y, opacity: p(0.2 + i * 0.15, 0.6 + i * 0.15) }}>
            <svg width={40 * u} height={40 * u} viewBox="0 0 24 24"><path d="M3 2 L20 12 L12 13.5 L8.5 21 Z" fill={color} stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg>
            <span style={{ position: 'absolute', left: 30 * u, top: 30 * u, background: color, color: '#fff', fontSize: 20 * u, fontWeight: 600, padding: `${4 * u}px ${12 * u}px`, borderRadius: 8 * u, whiteSpace: 'nowrap' }}>{name}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

function Film({ s, title, subtitle, cta, content }) {
  const { u, p, sec, width, height, frame, durationInFrames, fps } = useScene();
  const { bg, fg, accent, muted } = s.palette;
  const v = s.variant;
  const bars = interpolate(p(0, 1.2, Easing.inOut(Easing.cubic)), [0, 1], [0, height * (height > width ? 0.08 : 0.11)]);
  const zoom = interpolate(frame, [0, durationInFrames], [1.08, 1]);
  const jitter = v === 'archive' ? (random(`j${frame}`) - 0.5) * 3 * u : 0;
  const flicker = v === 'archive' || !v ? 0.92 + random(`f${frame}`) * 0.08 : 1;
  const sunY = interpolate(sec, [0, durationInFrames / fps], [0.74, 0.82]);
  return (
    <AbsoluteFill style={{ background: bg, color: fg, fontFamily: s.font, overflow: 'hidden', filter: v === 'archive' ? 'sepia(0.5) contrast(1.05)' : !v ? 'grayscale(1) contrast(1.15)' : 'none' }}>
      <AbsoluteFill style={{ transform: `scale(${zoom}) translateY(${jitter}px)`, opacity: flicker }}>
        {v === 'sunset' && <>
          <AbsoluteFill style={{ background: `linear-gradient(to bottom, ${bg} 0%, ${muted} 55%, ${accent} 100%)` }} />
          <div style={{ position: 'absolute', left: '50%', top: `${sunY * 100}%`, width: 520 * u, height: 520 * u, marginLeft: -260 * u, marginTop: -260 * u, borderRadius: '50%', background: `radial-gradient(circle, #ffd59a 0%, ${accent} 60%, transparent 71%)` }} />
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: '32%' }}>
            <path d="M0 30 L0 18 Q10 10 18 16 Q26 6 36 15 Q48 9 58 17 Q70 8 80 15 Q90 11 100 16 L100 30 Z" fill="#12061d" />
            <path d="M70 15 l1.2 -7 l1.2 7 M73 16 l1 -5 l1 5" stroke="#12061d" strokeWidth="0.8" fill="none" />
          </svg>
        </>}
        {v === 'story' && <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, ${muted} 0%, ${bg} 70%)` }} />}
        {v === 'archive' && <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, transparent 40%, ${muted}cc 100%)` }} />}
        {!v && <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 40%, #2a2a2a 0%, ${bg} 70%)` }} />}
        {content || <Stack>
          {v === 'archive' && <Fade start={0.3} style={{ fontSize: 26 * u, letterSpacing: '0.4em', color: accent, marginBottom: 24 * u, textTransform: 'uppercase' }}>— Arsip —</Fade>}
          <div style={{ fontSize: titleSize(title, u, 116), fontWeight: v === 'sunset' ? 700 : 400, fontStyle: v === 'story' ? 'italic' : 'normal', lineHeight: 1.08, opacity: p(0.4, 1.8, Easing.inOut(Easing.quad)), letterSpacing: !v ? '0.12em' : '0', textTransform: !v ? 'uppercase' : 'none', filter: `blur(${(1 - p(0.4, 1.6)) * 12 * u}px)`, maxWidth: width * 0.84 }}>{title}</div>
          <div style={{ height: 2 * u, width: 220 * u, background: accent, margin: `${30 * u}px auto`, transform: `scaleX(${p(1.3, 2.1)})` }} />
          {subtitle && <Fade start={1.7} y={0} style={{ fontSize: 38 * u, opacity: 0.85, fontStyle: 'italic', maxWidth: Math.min(width, height * 1.4) * 0.78 }}>{subtitle}</Fade>}
          {cta && <Fade start={2.3} y={0} style={{ marginTop: 40 * u, fontSize: 28 * u, letterSpacing: '0.3em', textTransform: 'uppercase', color: accent }}>{cta}</Fade>}
        </Stack>}
      </AbsoluteFill>
      <Grain amount={v === 'sunset' ? 0.08 : 0.22} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: bars, background: '#000' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: bars, background: '#000' }} />
    </AbsoluteFill>
  );
}

function Retro({ s, title, subtitle, cta, content }) {
  const { u, p, pop, sec, width, height, frame, fps } = useScene();
  const { bg, fg, accent, muted } = s.palette;
  const v = s.variant;
  const neon = (c, k = 1) => `0 0 ${6 * u * k}px #fff, 0 0 ${18 * u * k}px ${c}, 0 0 ${42 * u * k}px ${c}`;
  const flicker = v === 'neon' && sec < 1.4 ? (random(`n${Math.floor(frame / 2)}`) > 0.45 ? 1 : 0.25) : 1;
  // The pixel style moves in steps of 1/8 s.
  const stepped = v === 'pixel' ? Math.floor(frame / (fps / 8)) * (fps / 8) / fps : sec;
  const pixelIn = Math.min(1, Math.max(0, Math.floor((stepped - 0.2) * 8) / 6));
  const titleNode = v === 'pixel'
    ? <span style={{ clipPath: `inset(0 ${(1 - pixelIn) * 100}% 0 0)`, display: 'inline-block' }}>{title.toUpperCase()}</span>
    : v === 'dither' ? <TypeText text={title.toUpperCase()} start={0.25} cps={18} /> : <MaskWords text={title} start={0.3} upper={v === 'grid'} />;
  return (
    <AbsoluteFill style={{ background: bg, color: fg, fontFamily: s.font, overflow: 'hidden' }}>
      {v === 'grid' && <>
        <AbsoluteFill style={{ background: `linear-gradient(to bottom, ${bg} 0%, #3a0b5e 55%, ${accent}55 62%, ${bg} 63%)` }} />
        <div style={{ position: 'absolute', left: '50%', top: '30%', width: 560 * u, height: 560 * u, marginLeft: -280 * u, borderRadius: '50%', background: `linear-gradient(to bottom, #ffd34d, ${accent})`, maskImage: 'repeating-linear-gradient(to bottom, black 0, black 26px, transparent 26px, transparent 34px)', WebkitMaskImage: 'repeating-linear-gradient(to bottom, black 0, black 26px, transparent 26px, transparent 34px)', transform: `translateY(${(1 - p(0, 1.4)) * 200 * u}px)` }} />
        <div style={{ position: 'absolute', left: '-50%', right: '-50%', bottom: 0, height: '40%', backgroundImage: `linear-gradient(${muted} 2px, transparent 2px), linear-gradient(90deg, ${muted} 2px, transparent 2px)`, backgroundSize: `${100 * u}px ${100 * u}px`, backgroundPosition: `0 ${(sec * 120 * u) % (100 * u)}px`, transform: `perspective(${600 * u}px) rotateX(62deg)`, transformOrigin: 'top' }} />
      </>}
      {v === 'dither' && <AbsoluteFill style={{ backgroundImage: `radial-gradient(${accent} 32%, transparent 34%)`, backgroundSize: `${16 * u}px ${16 * u}px`, maskImage: `linear-gradient(${135 + sec * 20}deg, black, transparent 65%)`, WebkitMaskImage: `linear-gradient(${135 + sec * 20}deg, black, transparent 65%)`, opacity: 0.85 * p(0, 0.6) }} />}
      {v === 'pixel' && Array.from({ length: 16 }, (_, i) => {
        const x = Math.floor(random(`px${i}`) * 12) / 12;
        const y = ((Math.floor(random(`py${i}`) * 12) / 12) + Math.floor(stepped * 4) * 0.02 * (i % 3 + 1)) % 1;
        return <div key={i} style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, width: 30 * u, height: 30 * u, background: i % 3 ? muted : accent }} />;
      })}
      {v === 'neon' && <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 120%, ${muted}55, transparent 60%), radial-gradient(ellipse at 50% -20%, ${accent}44, transparent 60%)` }} />}
      {content || <Stack>
        <div style={{
          fontSize: titleSize(title, u, v === 'pixel' ? 96 : 120), fontWeight: 700, lineHeight: 1.08, maxWidth: width * 0.86, opacity: flicker,
          color: v === 'neon' ? '#fff' : v === 'grid' ? '#fff' : fg,
          textShadow: v === 'neon' ? neon(accent) : v === 'grid' ? `0 ${6 * u}px 0 ${accent}, 0 0 ${30 * u}px ${accent}` : v === 'pixel' ? `${6 * u}px ${6 * u}px 0 ${muted}` : `${4 * u}px ${4 * u}px 0 ${accent}`,
          fontStyle: v === 'grid' ? 'italic' : 'normal',
        }}>{titleNode}</div>
        {subtitle && <Fade start={1.2} y={v === 'pixel' ? 0 : 24} style={{ marginTop: 30 * u, fontSize: 38 * u, color: v === 'neon' ? muted : fg, textShadow: v === 'neon' ? neon(muted, 0.6) : v === 'grid' ? `0 ${2 * u}px ${12 * u}px #000, 0 0 ${4 * u}px #000` : 'none', letterSpacing: '0.06em', maxWidth: Math.min(width, height * 1.4) * 0.8 }}>{subtitle}</Fade>}
        <Cta text={cta} start={1.7} look={v === 'neon'
          ? { border: `${3 * u}px solid ${accent}`, color: '#fff', boxShadow: neon(accent, 0.6), textShadow: neon(accent, 0.4), background: 'transparent' }
          : v === 'pixel' ? { background: accent, color: bg, borderRadius: 0, boxShadow: `${8 * u}px ${8 * u}px 0 ${muted}`, transform: `scale(${pop(1.7) > 0.5 ? 1 : 0})` }
            : { background: accent, color: '#fff', borderRadius: v === 'dither' ? 0 : 999 }} />
      </Stack>}
    </AbsoluteFill>
  );
}

function Light({ s, title, subtitle, cta, content }) {
  const { u, p, sec, width, height } = useScene();
  const { bg, fg, accent, muted } = s.palette;
  const spot = s.variant === 'spot';
  const sweep = interpolate(p(0, 1.8, Easing.inOut(Easing.cubic)), [0, 1], [-30, 50]);
  return (
    <AbsoluteFill style={{ background: bg, color: fg, fontFamily: s.font, overflow: 'hidden' }}>
      {spot ? <>
        <AbsoluteFill style={{ background: `radial-gradient(ellipse ${55}% ${45}% at ${sweep}% 42%, ${accent}40, transparent 70%)` }} />
        <div style={{ position: 'absolute', left: '50%', bottom: '14%', width: 520 * u, height: 40 * u, marginLeft: -260 * u, borderRadius: '50%', background: `radial-gradient(ellipse, ${accent}55, transparent 70%)`, opacity: p(1, 2) }} />
      </> : Array.from({ length: 9 }, (_, i) => {
        const y = 0.12 + (i / 9) * 0.8;
        const speed = 0.35 + random(`s${i}`) * 0.4;
        const x = ((sec * speed + random(`x${i}`)) % 1.4) - 0.4;
        return <div key={i} style={{ position: 'absolute', top: `${y * 100}%`, left: `${x * 100}%`, width: `${30 + random(`w${i}`) * 30}%`, height: (3 + random(`h${i}`) * 5) * u, borderRadius: 99, background: `linear-gradient(90deg, transparent, ${i % 2 ? accent : muted}, #fff)`, boxShadow: `0 0 ${24 * u}px ${i % 2 ? accent : muted}`, opacity: 0.75 * p(0, 0.8), transform: `rotate(${-8 + i * 2}deg)` }} />;
      })}
      {content || <Stack>
        <div style={{
          fontSize: titleSize(title, u, 120), fontWeight: spot ? 500 : 700, letterSpacing: spot ? '0.08em' : '-0.01em', lineHeight: 1.06, maxWidth: width * 0.84,
          backgroundImage: `linear-gradient(100deg, ${fg}55 0%, ${fg} ${sweep + 10}%, #fff ${sweep + 18}%, ${fg} ${sweep + 26}%, ${fg}55 100%)`,
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          opacity: p(0.2, 1.2), transform: `scale(${interpolate(p(0.2, 2), [0, 1], [1.08, 1])})`, textTransform: spot ? 'uppercase' : 'none',
        }}>{title}</div>
        {subtitle && <Fade start={1.3} style={{ marginTop: 30 * u, fontSize: 36 * u, color: spot ? accent : '#d8d4ff', letterSpacing: spot ? '0.3em' : '0.02em', textTransform: spot ? 'uppercase' : 'none', maxWidth: Math.min(width, height * 1.4) * 0.8 }}>{subtitle}</Fade>}
        <Cta text={cta} start={1.9} look={spot
          ? { background: 'transparent', color: accent, border: `${2 * u}px solid ${accent}`, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 500 }
          : { background: `linear-gradient(90deg, ${accent}, ${muted})`, color: '#fff', boxShadow: `0 0 ${40 * u}px ${accent}88` }} />
      </Stack>}
    </AbsoluteFill>
  );
}

/* ---------------------------------------------------------------- layers */

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(String(hex).slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

// The style's colours for layers drawn on top of its background; onAccent is whichever reads best on the accent.
function look(s) {
  const { bg, fg, accent, muted } = s.palette;
  const onAccent = [bg, fg, '#111111', '#ffffff'].reduce((best, c) => (contrast(c, accent) > contrast(best, accent) + 1.5 ? c : best), bg);
  return { bg, fg, accent, muted, onAccent, font: s.font, sans: 'var(--font-sans), sans-serif', mono: 'var(--font-mono), ui-monospace, monospace' };
}

// A layer's text, split per word or typed out when its entrance works that way.
function LayerText({ text, entrance, start, style }) {
  const { sec, u } = useScene();
  const anim = ENTRANCES[entrance];
  if (anim?.split === 'type' || anim?.split === 'scramble') {
    return <TypeText text={text} start={start} cps={Math.max(14, text.length / anim.seconds)} scramble={anim.split === 'scramble'} cursor={anim.split === 'type' && sec < start + anim.seconds + 0.6} style={style} />;
  }
  if (anim?.split === 'word') {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    return (
      <span style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: '0.26em', ...style }}>
        {words.map((word, index) => {
          const t = Math.min(1, Math.max(0, (sec - start - index * anim.stagger) / anim.seconds));
          return <span key={index} style={{ display: 'inline-block', ...toStyle(combine(sample(anim, t)), u) }}>{word}</span>;
        })}
      </span>
    );
  }
  return <span style={style}>{text}</span>;
}

// Counts up to a value like "10.000+" over [from, from + duration] seconds.
function CountUp({ value, from, duration = 1.3 }) {
  const { p } = useScene();
  const parsed = parseCount(value);
  if (!parsed) return value;
  return parsed.format(parsed.number * p(from, from + duration, Easing.out(Easing.cubic)));
}

function Stars({ rating, start, color }) {
  const { pop, u } = useScene();
  return (
    <div style={{ display: 'flex', gap: 10 * u, justifyContent: 'center' }}>
      {Array.from({ length: 5 }, (_, i) => {
        const k = pop(start + i * 0.1, { damping: 10, stiffness: 180 });
        return (
          <svg key={i} width={46 * u} height={46 * u} viewBox="0 0 24 24" style={{ transform: `scale(${k})`, opacity: i < rating ? 1 : 0.25 }}>
            <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill={color} />
          </svg>
        );
      })}
    </div>
  );
}

// Lottie files fetched once per page and shared by every layer and frame that shows them.
const lottieCache = new Map();

// Plays a Lottie animation (lottieLibrary.js), looping, from the scene's start. Rendering waits for the file.
function LottieClip({ src, size }) {
  const url = src ? lottieUrl(src) : '';
  const [data, setData] = useState(() => lottieCache.get(url) || null);
  const [handle] = useState(() => (url && !lottieCache.has(url) ? delayRender(`Lottie ${url}`) : null));
  useEffect(() => {
    if (!url) { if (handle !== null) continueRender(handle); return undefined; }
    let live = true;
    if (lottieCache.has(url)) {
      setData(lottieCache.get(url));
      if (handle !== null) continueRender(handle);
      return undefined;
    }
    fetch(url, { credentials: url.startsWith('/') ? 'include' : 'omit' })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => { const clean = sanitizeLottie(json); lottieCache.set(url, clean); if (live) setData(clean); })
      .catch(() => lottieCache.set(url, null))
      .finally(() => { if (handle !== null) continueRender(handle); });
    return () => { live = false; };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return <div style={{ width: size, height: size }} />;
  return <Lottie animationData={data} loop style={{ width: size, height: size }} />;
}

function LayerBody({ layer, start, look, maxWidth }) {
  const { u, p, pop, sec, width, height } = useScene();
  const { fg, accent, font, sans, mono, bg, onAccent } = look;
  const textStart = start;
  switch (layer.type) {
    case 'kicker':
      return <div style={{ fontFamily: sans, fontSize: 30 * u, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: accent }}><LayerText text={layer.text} entrance={layer.entrance} start={textStart} /></div>;
    case 'heading':
      return <div style={{ fontFamily: font, fontSize: titleSize(layer.text, u, 120), fontWeight: 700, lineHeight: 1.04, letterSpacing: '-0.02em', color: fg, maxWidth }}><LayerText text={layer.text} entrance={layer.entrance} start={textStart} /></div>;
    case 'text':
      return <div style={{ fontFamily: sans, fontSize: 40 * u, fontWeight: 500, lineHeight: 1.3, color: fg, opacity: 0.82, maxWidth }}><LayerText text={layer.text} entrance={layer.entrance} start={textStart} /></div>;
    case 'number': {
      const size = Math.min(230, 1500 / Math.max(4, String(layer.value).length)) * u;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontFamily: font, fontSize: size, fontWeight: 800, lineHeight: 1, color: accent, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}><CountUp value={layer.value} from={start + 0.1} /></div>
          {layer.text && <div style={{ marginTop: 14 * u, fontFamily: sans, fontSize: 38 * u, fontWeight: 600, color: fg, opacity: 0.85 }}>{layer.text}</div>}
        </div>
      );
    }
    case 'list':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 * u, alignItems: 'stretch', textAlign: 'left', maxWidth }}>
          {layer.items.map((item, index) => {
            const itemStart = start + index * 0.3;
            const motion = toStyle(combine(ENTRANCES[layer.entrance]?.keyframes.length ? sample(ENTRANCES[layer.entrance], Math.min(1, Math.max(0, (sec - itemStart) / ENTRANCES[layer.entrance].seconds))) : { o: sec >= itemStart ? 1 : 0 }), u);
            return (
              <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 22 * u, ...motion }}>
                <span style={{ flex: 'none', width: 64 * u, height: 64 * u, borderRadius: '50%', background: accent, color: onAccent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: sans, fontWeight: 800, fontSize: 32 * u }}>{index + 1}</span>
                <span style={{ fontFamily: sans, fontSize: 44 * u, fontWeight: 600, color: fg, lineHeight: 1.2 }}>{item}</span>
              </div>
            );
          })}
        </div>
      );
    case 'price': {
      const was = layer.was;
      const now = layer.now;
      const drop = was > now && now > 0;
      const strike = p(start + 0.5, start + 0.9);
      const t = drop ? pop(start + 0.8, { damping: 18, mass: 0.6 }) : 1;
      const shown = drop ? was + (now - was) * Math.min(1, t) : now || was;
      const land = interpolate(t, [0.9, 1], [1.1, 1], clamp);
      const off = drop ? Math.round((1 - now / was) * 100) : 0;
      const badge = pop(start + 1.4, { damping: 9, stiffness: 160 });
      return (
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', fontVariantNumeric: 'tabular-nums' }}>
          {drop && (
            <span style={{ position: 'relative', fontFamily: sans, fontSize: 56 * u, fontWeight: 600, color: fg, opacity: 0.55 }}>
              {formatRupiah(was)}
              <span style={{ position: 'absolute', left: '-4%', top: '52%', height: 6 * u, width: `${strike * 108}%`, background: accent, borderRadius: 3 * u }} />
            </span>
          )}
          <span style={{ fontFamily: font, fontSize: Math.min(150, 1300 / formatRupiah(shown).length) * u, fontWeight: 800, color: accent, lineHeight: 1.05, transform: `scale(${land})` }}>{formatRupiah(shown)}</span>
          {off > 0 && (
            <span style={{ position: 'absolute', right: -70 * u, top: -125 * u, width: 150 * u, height: 150 * u, borderRadius: '50%', background: fg, color: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: sans, fontWeight: 800, fontSize: 44 * u, transform: `scale(${badge}) rotate(${-12 + (1 - badge) * 40}deg)` }}>-{off}%</span>
          )}
        </div>
      );
    }
    case 'code':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 * u }}>
          <span style={{ fontFamily: sans, fontSize: 24 * u, letterSpacing: '0.25em', color: fg, opacity: 0.7 }}>KODE</span>
          <span style={{ fontFamily: mono, fontSize: 56 * u, fontWeight: 700, color: fg, padding: `${14 * u}px ${36 * u}px`, border: `${4 * u}px dashed ${accent}`, borderRadius: 16 * u, background: `${fg}12`, letterSpacing: '0.08em' }}>{layer.text}</span>
        </div>
      );
    case 'timer': {
      const total = countdownSeconds(layer.value);
      const clock = String(layer.value || '').includes(':');
      const remaining = Math.max(0, total - Math.max(0, sec - start - 0.3));
      if (!clock) {
        const n = Math.ceil(Math.min(total, MAX_COUNT) - Math.max(0, sec - start - 0.3));
        const tick = (sec - start - 0.3) % 1;
        const k = n > 0 ? interpolate(tick < 0 ? 0 : tick, [0, 0.25, 1], [1.4, 1, 0.92], clamp) : pop(start + 0.3 + total);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {layer.text && <div style={{ fontFamily: sans, fontSize: 36 * u, fontWeight: 600, color: fg, opacity: 0.8, marginBottom: 10 * u }}>{layer.text}</div>}
            <div style={{ fontFamily: font, fontSize: 320 * u, fontWeight: 800, lineHeight: 1, color: accent, transform: `scale(${k})` }}>{n > 0 ? n : '0'}</div>
          </div>
        );
      }
      const whole = Math.ceil(remaining);
      const parts = total >= 3600 ? [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60] : [Math.floor(whole / 60), whole % 60];
      const labels = total >= 3600 ? ['JAM', 'MENIT', 'DETIK'] : ['MENIT', 'DETIK'];
      const tick = 1 - (remaining - Math.floor(remaining));
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 * u }}>
          {layer.text && <div style={{ fontFamily: sans, fontSize: 36 * u, fontWeight: 600, color: fg, opacity: 0.85 }}>{layer.text}</div>}
          <div style={{ display: 'flex', gap: 18 * u }}>
            {parts.map((part, index) => (
              <div key={index} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 * u }}>
                <span style={{ fontFamily: mono, fontSize: 96 * u, fontWeight: 700, color: fg, background: `${fg}14`, border: `${2 * u}px solid ${accent}55`, borderRadius: 18 * u, padding: `${10 * u}px ${20 * u}px`, fontVariantNumeric: 'tabular-nums', transform: index === parts.length - 1 ? `scale(${1 + 0.06 * Math.max(0, 1 - tick * 4)})` : undefined }}>{String(part).padStart(2, '0')}</span>
                <span style={{ fontFamily: sans, fontSize: 20 * u, letterSpacing: '0.2em', color: accent }}>{labels[index]}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'quote':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26 * u, maxWidth }}>
          {layer.rating > 0 && <Stars rating={layer.rating} start={start + 0.2} color={accent} />}
          <div style={{ position: 'relative', fontFamily: font, fontSize: Math.min(60, 2600 / Math.max(40, layer.text.length)) * u, fontWeight: 600, lineHeight: 1.25, color: fg }}>
            <span style={{ position: 'absolute', left: -50 * u, top: -60 * u, fontSize: 160 * u, color: accent, opacity: 0.5, fontFamily: 'Georgia, serif', lineHeight: 1 }}>“</span>
            <LayerText text={layer.text} entrance={layer.entrance} start={start} />
          </div>
          {(layer.author || layer.role) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 * u, opacity: p(start + 0.8, start + 1.3) }}>
              <span style={{ width: 72 * u, height: 72 * u, borderRadius: '50%', background: accent, color: onAccent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: sans, fontWeight: 800, fontSize: 32 * u }}>{(layer.author || '?').trim().charAt(0).toUpperCase()}</span>
              <span style={{ textAlign: 'left', fontFamily: sans }}>
                <span style={{ display: 'block', fontSize: 34 * u, fontWeight: 700, color: fg }}>{layer.author}</span>
                {layer.role && <span style={{ display: 'block', fontSize: 26 * u, color: fg, opacity: 0.65 }}>{layer.role}</span>}
              </span>
            </div>
          )}
        </div>
      );
    case 'button':
      return <div style={{ padding: `${24 * u}px ${54 * u}px`, borderRadius: 999, background: accent, color: onAccent, fontFamily: sans, fontSize: 38 * u, fontWeight: 700 }}>{layer.text}</div>;
    case 'badge':
      return <div style={{ padding: `${14 * u}px ${34 * u}px`, borderRadius: 14 * u, background: accent, color: onAccent, fontFamily: sans, fontSize: 36 * u, fontWeight: 800, letterSpacing: '0.04em', transform: 'rotate(-4deg)' }}>{layer.text}</div>;
    case 'progress': {
      const target = Math.min(100, Math.max(0, Number(String(layer.value).replace(/[^\d.]/g, '')) || 0));
      const t = p(start + 0.2, start + 1.5, Easing.out(Easing.cubic));
      return (
        <div style={{ width: Math.min(width * 0.72, 900 * u), display: 'flex', flexDirection: 'column', gap: 14 * u }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: sans, fontSize: 34 * u, fontWeight: 600, color: fg }}>
            <span>{layer.text}</span><span style={{ color: accent, fontVariantNumeric: 'tabular-nums' }}>{Math.round(target * t)}%</span>
          </div>
          <div style={{ height: 28 * u, borderRadius: 999, background: `${fg}1f`, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${target * t}%`, background: accent, borderRadius: 999 }} />
          </div>
        </div>
      );
    }
    case 'bars': {
      const values = layer.values.length ? layer.values : [1];
      const top = Math.max(...values, 1);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 * u }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22 * u, height: 360 * u }}>
            {values.map((value, index) => {
              const k = pop(start + 0.2 + index * 0.12, { damping: 14, stiffness: 120 });
              return <div key={index} style={{ width: 70 * u, height: `${(value / top) * 100 * k}%`, background: index === values.length - 1 ? accent : `${fg}55`, borderRadius: `${14 * u}px ${14 * u}px 0 0` }} />;
            })}
          </div>
          {layer.text && <div style={{ fontFamily: sans, fontSize: 34 * u, fontWeight: 600, color: fg, opacity: 0.85 }}>{layer.text}</div>}
        </div>
      );
    }
    case 'line': {
      const values = layer.values.length > 1 ? layer.values : [0, ...(layer.values.length ? layer.values : [1])];
      const top = Math.max(...values, 1);
      const w = Math.min(width * 0.74, 980 * u);
      const h = w * 0.48;
      const points = values.map((value, i) => [(i / (values.length - 1)) * 1000, 470 - (value / top) * 420]);
      const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
      const draw = p(start + 0.2, start + 1.5, Easing.inOut(Easing.cubic));
      const [lx, ly] = points[points.length - 1];
      const dot = pop(start + 1.5, { damping: 10, stiffness: 180 });
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 * u }}>
          <div style={{ position: 'relative', width: w, height: h }}>
            <svg viewBox="0 0 1000 500" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
              {[125, 250, 375].map((y) => <line key={y} x1="0" x2="1000" y1={y} y2={y} stroke={fg} strokeOpacity="0.12" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
              <path d={`${d} L1000 500 L0 500 Z`} fill={accent} opacity={0.18 * draw} />
              <path d={d} pathLength={1} fill="none" stroke={accent} strokeWidth={7 * u} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={1} strokeDashoffset={1 - draw} vectorEffect="non-scaling-stroke" />
            </svg>
            <span style={{ position: 'absolute', left: `${lx / 10}%`, top: `${ly / 5}%`, width: 30 * u, height: 30 * u, marginLeft: -15 * u, marginTop: -15 * u, borderRadius: '50%', background: accent, boxShadow: `0 0 0 ${8 * u}px ${accent}40`, transform: `scale(${dot})` }} />
            {layer.value && (
              <span style={{ position: 'absolute', right: `${100 - lx / 10 + 3}%`, top: `${ly / 5}%`, transform: `translateY(25%) scale(${dot})`, transformOrigin: 'right top', fontFamily: font, fontWeight: 800, fontSize: 64 * u, color: accent }}>{layer.value}</span>
            )}
          </div>
          {layer.text && <div style={{ fontFamily: sans, fontSize: 34 * u, fontWeight: 600, color: fg, opacity: 0.85 }}>{layer.text}</div>}
        </div>
      );
    }
    case 'flow': {
      const vertical = height > width;
      const items = layer.items.length ? layer.items : [''];
      return (
        <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center', gap: 0 }}>
          {items.map((item, index) => {
            const at = start + index * 0.6;
            const node = pop(at, { damping: 12, stiffness: 170 });
            const link = p(at + 0.3, at + 0.6, Easing.inOut(Easing.cubic));
            return (
              <div key={index} style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 * u, padding: `${20 * u}px ${30 * u}px`, borderRadius: 24 * u, background: `${fg}12`, border: `${3 * u}px solid ${accent}`, transform: `scale(${node})`, opacity: Math.min(1, node * 1.5), maxWidth: vertical ? width * 0.7 : 360 * u }}>
                  <span style={{ flex: 'none', width: 54 * u, height: 54 * u, borderRadius: '50%', background: accent, color: onAccent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: sans, fontWeight: 800, fontSize: 28 * u }}>{index + 1}</span>
                  <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 38 * u, color: fg, textAlign: 'left', lineHeight: 1.15 }}>{item}</span>
                </div>
                {index < items.length - 1 && (
                  <svg width={vertical ? 40 * u : 90 * u} height={vertical ? 70 * u : 40 * u} viewBox={vertical ? '0 0 40 70' : '0 0 90 40'}>
                    <path d={vertical ? 'M20 6 L20 56 M10 46 L20 58 L30 46' : 'M6 20 L76 20 M66 10 L78 20 L66 30'} pathLength={1} fill="none" stroke={accent} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={1} strokeDashoffset={1 - link} />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      );
    }
    case 'chat': {
      const times = chatTimes(layer.messages, start).messages;
      const panel = Math.min(width * 0.88, 900 * u);
      return (
        <div style={{ width: panel, display: 'flex', flexDirection: 'column', gap: 14 * u, padding: 24 * u, borderRadius: 36 * u, background: `${fg}0f`, border: `${2 * u}px solid ${fg}1f`, textAlign: 'left' }}>
          {layer.text && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 * u, paddingBottom: 14 * u, borderBottom: `${2 * u}px solid ${fg}1a` }}>
              <span style={{ width: 60 * u, height: 60 * u, borderRadius: '50%', background: accent, color: onAccent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: sans, fontWeight: 800, fontSize: 28 * u }}>{layer.text.trim().charAt(0).toUpperCase()}</span>
              <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 32 * u, color: fg }}>{layer.text}</span>
            </div>
          )}
          {layer.messages.map((message, index) => {
            const { typing, at } = times[index];
            const mine = message.from === 'me';
            if (typing !== null && sec >= typing && sec < at) {
              return (
                <div key={index} style={{ alignSelf: 'flex-start', display: 'flex', gap: 8 * u, padding: `${20 * u}px ${24 * u}px`, borderRadius: 28 * u, background: `${fg}1f` }}>
                  {[0, 1, 2].map((dot) => <span key={dot} style={{ width: 14 * u, height: 14 * u, borderRadius: '50%', background: fg, opacity: 0.35 + 0.65 * Math.max(0, Math.sin((sec - typing) * 9 - dot * 0.9)) }} />)}
                </div>
              );
            }
            if (sec < at) return null;
            const k = pop(at, { damping: 13, stiffness: 190 });
            return (
              <div key={index} style={{
                alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%', padding: `${16 * u}px ${24 * u}px`, borderRadius: 28 * u,
                [mine ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: 8 * u,
                background: mine ? accent : `${fg}1f`, color: mine ? onAccent : fg, fontFamily: sans, fontSize: 42 * u, fontWeight: 500, lineHeight: 1.25,
                transform: `translateY(${(1 - k) * 30 * u}px) scale(${0.85 + 0.15 * k})`, transformOrigin: mine ? 'right bottom' : 'left bottom', opacity: Math.min(1, k * 1.6),
              }}>{message.text}</div>
            );
          })}
        </div>
      );
    }
    case 'lottie': {
      const size = (LOTTIE_SIZES[layer.size]?.px || 420) * u * (height > width ? 1 : 0.8);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 * u }}>
          <LottieClip src={layer.src} size={size} />
          {layer.text && <div style={{ fontFamily: sans, fontSize: 36 * u, fontWeight: 600, color: fg, opacity: 0.85 }}>{layer.text}</div>}
        </div>
      );
    }
    default:
      return null;
  }
}

// A 'layers' scene. Layout 'center' stacks the layers in the middle; 'split' puts the scene's visual (the first
// lottie, number, chart, ... layer) beside the words in landscape and above them in portrait; 'hero' shows the visual
// large behind the words. Each layer moves by its entrance, loop and exit; with a voiceover, a layer comes in when
// its words are spoken. Shrinks to fit when the content is taller than the frame.
function LayerStack({ s, layers, layout = 'center', words = null, offset = 0 }) {
  const { u, sec, fps, durationInFrames, width, height, outro } = useScene();
  const colors = look(s);
  const starts = layerStarts(layers, words, offset);
  const sceneSeconds = durationInFrames / fps;
  const boxRef = useRef(null);
  const [fit, setFit] = useState(1);
  const captionRoom = useContext(CaptionRoom);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const room = height - 180 * u - captionRoom;
    const needed = box.scrollHeight;
    const next = needed > room ? Math.max(0.5, room / needed) : 1;
    if (Math.abs(next - fit) > 0.01) setFit(next);
  });
  const portrait = height > width;
  const visual = layout === 'center' ? -1 : layers.findIndex((layer) => VISUAL_TYPES.has(layer.type));
  const arranged = visual >= 0 ? layout : 'center';
  const maxWidth = arranged === 'split' && !portrait ? width * 0.42 : Math.min(width, height * 1.3) * 0.82;

  const render = (index, extra = {}) => {
    const layer = layers[index];
    const start = starts[index];
    const split = ENTRANCES[layer.entrance]?.split || layer.type === 'list' || layer.type === 'chat';
    const motion = layerMotion({ entrance: split ? null : layer.entrance, loop: layer.loop, exit: layer.exit, start, sceneSeconds, sec });
    if (split && sec < start) motion.o = 0;
    const style = toStyle(motion, u);
    if (!layer.exit) style.opacity *= outro;
    return (
      <div key={index} style={{ ...style, transformOrigin: ENTRANCES[layer.entrance]?.origin || 'center', ...extra }}>
        <LayerBody layer={layer} start={start} look={colors} maxWidth={maxWidth} />
      </div>
    );
  };
  const rest = layers.map((_, index) => index).filter((index) => index !== visual);
  const column = (indexes, align = 'center') => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'left' ? 'flex-start' : 'center', textAlign: align, gap: 34 * u }}>
      {indexes.map((index) => render(index))}
    </div>
  );

  let content;
  if (arranged === 'split') {
    content = portrait ? (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 56 * u }}>
        <div style={{ transform: 'scale(1.15)' }}>{render(visual)}</div>
        {column(rest)}
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 90 * u }}>
        <div style={{ flex: 'none', maxWidth: width * 0.42 }}>{render(visual)}</div>
        {column(rest, 'left')}
      </div>
    );
  } else if (arranged === 'hero') {
    const lottie = layers[visual].type === 'lottie';
    content = (
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {lottie ? (
          // A Lottie hero sits large above the words, overlapping them a little.
          <div style={{ transform: `scale(${portrait ? 1.6 : 1.25})`, transformOrigin: 'center bottom', marginBottom: (portrait ? -40 : -30) * u, pointerEvents: 'none' }}>{render(visual)}</div>
        ) : (
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%) scale(1.9)', opacity: 0.2, pointerEvents: 'none' }}>{render(visual)}</div>
        )}
        <div style={{ position: 'relative', textShadow: `0 ${4 * u}px ${24 * u}px ${colors.bg}` }}>{column(rest)}</div>
      </div>
    );
  } else {
    content = column(layers.map((_, index) => index));
  }
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', paddingBottom: captionRoom }}>
      <div ref={boxRef} style={{ padding: `0 ${70 * u}px`, transform: `scale(${fit})` }}>{content}</div>
    </AbsoluteFill>
  );
}

// A slow camera move over the whole scene (sceneKinds.js CAMERAS), so long holds keep moving.
function Camera({ kind, children }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const length = useContext(SceneLength) ?? durationInFrames;
  if (!kind || kind === 'still') return children;
  const t = Math.min(1, Math.max(0, frame / length));
  const transform = kind === 'pull' ? `scale(${1.07 - 0.07 * t})`
    : kind === 'drift' ? `scale(1.06) translateX(${(0.5 - t) * 3}%)`
      : `scale(${1 + 0.07 * t})`;
  return <AbsoluteFill style={{ transform }}>{children}</AbsoluteFill>;
}

const SCENES = { clean: Clean, pop: Pop, paper: Paper, sketch: Sketch, tech: Tech, film: Film, retro: Retro, light: Light };

export const sceneFrames = (scene, fps) => Math.max(1, Math.round((Number(scene.seconds) || 5) * fps));

// The music's volume at a frame: `base`, dipped under every voiceover and faded out over the last second.
export function musicVolume(frame, { base, ducks, total, fps }) {
  const ramp = 0.25 * fps;
  let duck = 0;
  for (const [from, to] of ducks) {
    duck = Math.max(duck, interpolate(frame, [from - ramp, from, to, to + ramp], [0, 1, 1, 0], clamp));
  }
  const end = interpolate(frame, [total - fps, total - 1], [1, 0], clamp);
  return base * (1 - 0.65 * duck) * end;
}

const SFX_URL = (name) => `/motion-sfx/${name}.mp3`;

// How a scene comes in over the end of the one before: `frame` counts from the start of the overlap.
function TransitionIn({ kind, children }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = interpolate(frame, [0, TRANSITION_SECONDS * fps], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  if (t >= 1 || kind === 'cut') return children;
  let style = {};
  if (kind === 'fade') style = { opacity: t };
  if (kind === 'wipe') style = { clipPath: `inset(0 ${(1 - t) * 100}% 0 0)` };
  if (kind === 'slide') style = { transform: `translateX(${(1 - t) * 100}%)` };
  if (kind === 'zoom') style = { opacity: t, transform: `scale(${1.18 - 0.18 * t})` };
  if (kind === 'circle') style = { clipPath: `circle(${t * 75}% at 50% 50%)` };
  if (kind === 'paper') {
    // A torn edge rising from the bottom: a jagged line at height y.
    const y = (1 - t) * 112 - 6;
    const edge = Array.from({ length: 21 }, (_, i) => `${i * 5}% ${(y + (random(`tear${i}`) - 0.5) * 5).toFixed(2)}%`);
    style = { clipPath: `polygon(${edge.join(', ')}, 100% 100%, 0% 100%)` };
  }
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
}

// Captions for a scene's voiceover, each word appearing as it is spoken, in one of CAPTION_STYLES: a few words at a
// time (one word for 'one'), the spoken word picked out. Sits low in the frame, clear of the platform UI.
function Captions({ words, s, captionStyle = 'karaoke' }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const sec = frame / fps;
  const perPage = captionStyle === 'one' ? 1 : captionStyle === 'subtitle' ? 7 : 3;
  const span = captionStyle === 'subtitle' ? 3 : 1.4;
  const pages = [];
  for (const word of words) {
    const page = pages[pages.length - 1];
    if (page && page.length < perPage && word.s - page[page.length - 1].e < 0.35 && word.e - page[0].s < span) page.push(word);
    else pages.push([word]);
  }
  const index = pages.findIndex((page, i) => sec >= page[0].s - 0.05 && sec < (pages[i + 1]?.[0].s ?? page[page.length - 1].e + 0.6));
  if (index < 0) return null;
  const accent = s.palette.accent;
  const highlight = luminance(accent) > 0.3 ? accent : '#FFD54A';
  const portrait = height > width;
  const outline = { textShadow: `0 ${4 * u}px ${14 * u}px rgba(0,0,0,0.55), 0 0 ${3 * u}px rgba(0,0,0,0.9)`, WebkitTextStroke: `${2.5 * u}px rgba(0,0,0,0.85)`, paintOrder: 'stroke fill' };
  const size = { karaoke: portrait ? 68 : 58, box: portrait ? 66 : 56, one: portrait ? 120 : 96, paper: portrait ? 56 : 48, neon: portrait ? 68 : 58, subtitle: portrait ? 44 : 38 }[captionStyle] * u;
  const container = {
    paper: { background: '#FFF4DC', color: '#24365C', padding: `${18 * u}px ${32 * u}px`, borderRadius: 10 * u, boxShadow: `0 ${9 * u}px ${18 * u}px rgba(0,0,0,0.3)`, transform: `rotate(-1.2deg)`, position: 'relative' },
    subtitle: { background: 'rgba(0,0,0,0.62)', color: '#fff', padding: `${12 * u}px ${26 * u}px`, borderRadius: 12 * u },
  }[captionStyle] || {};
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: portrait ? height * 0.16 : height * 0.08, pointerEvents: 'none' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: '0.28em', rowGap: '0.1em', maxWidth: width * 0.84, fontFamily: 'var(--font-sans), sans-serif', fontWeight: captionStyle === 'subtitle' ? 600 : 800, fontSize: size, lineHeight: 1.15, textAlign: 'center', textTransform: captionStyle === 'one' ? 'uppercase' : 'none', ...container }}>
        {captionStyle === 'paper' && <span style={{ position: 'absolute', top: -16 * u, left: '50%', width: 120 * u, height: 34 * u, marginLeft: -60 * u, background: '#FFD54A', opacity: 0.85, transform: 'rotate(3deg)' }} />}
        {pages[index].map((word, i) => {
          const k = spring({ frame: frame - Math.round(word.s * fps), fps, config: { damping: 12, stiffness: 220 } });
          const active = sec >= word.s && sec < word.e + 0.08;
          const shown = sec >= word.s - 0.05;
          const look = {
            karaoke: { color: active ? highlight : '#ffffff', ...outline },
            box: { color: active ? onColor(highlight) : '#ffffff', background: active ? highlight : 'transparent', padding: `0 ${0.18}em`, borderRadius: 10 * u, ...(active ? {} : outline) },
            one: { color: '#ffffff', ...outline, transform: `scale(${0.6 + 0.4 * k})` },
            paper: { color: active ? '#24365C' : '#24365Cb3', background: active ? '#FFD54A' : 'transparent', padding: `0 ${0.12}em`, borderRadius: 4 * u },
            neon: { color: '#ffffff', textShadow: `0 0 ${8 * u}px ${highlight}, 0 0 ${22 * u}px ${highlight}, 0 0 ${44 * u}px ${highlight}`, opacity: active ? 1 : 0.75 },
            subtitle: { color: '#ffffff' },
          }[captionStyle] || {};
          const motion = captionStyle === 'subtitle' ? {} : { transform: look.transform || `translateY(${(1 - k) * 0.2}em) scale(${0.7 + 0.3 * k})` };
          return <span key={i} style={{ display: 'inline-block', opacity: captionStyle === 'subtitle' ? 1 : shown ? Math.min(1, k * 2) : 0, ...look, ...motion }}>{word.w}</span>;
        })}
      </div>
    </AbsoluteFill>
  );
}

const onColor = (hex) => (luminance(hex) > 0.45 ? '#111111' : '#ffffff');

// scenes: [{ kind, title, subtitle, cta, seconds, layers, transition, voAudio }] (sceneKinds.js); without it, one scene
// from title/subtitle/cta. audio: { music, musicVolume, captions, sfx, sfxVolume } (sceneKinds.js cleanAudio).
// Each scene after the first starts TRANSITION_SECONDS early and comes in over the end of the one before; its
// voiceover, captions and the cut itself stay on the scene's own start.
export default function MotionScene({ style, scenes, title = '', subtitle = '', cta = '', audio }) {
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const Scene = SCENES[style?.family] || Clean;
  if (!scenes?.length) return <Scene s={style} title={title} subtitle={subtitle} cta={cta} />;
  const overlap = Math.round(TRANSITION_SECONDS * fps);
  const starts = [];
  let at = 0;
  for (const scene of scenes) { starts.push(at); at += sceneFrames(scene, fps); }
  const ducks = scenes.filter((scene) => scene.voAudio?.url).map((scene) => {
    const from = starts[scenes.indexOf(scene)];
    return [from, from + Math.round(scene.voAudio.seconds * fps)];
  });
  const base = audio?.musicVolume ?? 0.5;
  const captionsOn = audio?.captions !== false;
  const sfxVolume = audio?.sfx === false ? 0 : (audio?.sfxVolume ?? 0.5);
  const captionRoom = (height > width ? 0.24 : 0.17) * height;
  return (
    <AbsoluteFill style={{ background: style?.palette?.bg }}>
      {audio?.music?.url && base > 0 && (
        <Audio src={audio.music.url} loop volume={(frame) => musicVolume(frame, { base, ducks, total: durationInFrames, fps })} />
      )}
      {scenes.map((scene, index) => {
        const lead = index > 0 && scene.transition !== 'cut' ? overlap : 0;
        const from = starts[index] - lead;
        const length = sceneFrames(scene, fps) + lead;
        const words = captionsOn ? scene.voAudio?.words : null;
        return (
          <Sequence key={index} from={from} durationInFrames={length} layout="none">
            <Sequence durationInFrames={length}>
              <TransitionIn kind={lead ? scene.transition : 'cut'}>
                <SceneLength.Provider value={length}>
                  <CaptionRoom.Provider value={words?.length ? captionRoom : 0}>
                    <Camera kind={scene.camera}>
                      {scene.kind === 'layers'
                        ? <Scene s={style} title="" subtitle="" cta="" content={<LayerStack s={style} layers={scene.layers || []} layout={scene.layout} words={scene.voAudio?.words} offset={lead / fps} />} />
                        : <Scene s={style} title={scene.title} subtitle={scene.subtitle} cta={scene.cta} />}
                    </Camera>
                  </CaptionRoom.Provider>
                </SceneLength.Provider>
              </TransitionIn>
            </Sequence>
            {sfxVolume > 0 && sceneSfx(scene, index, lead / fps).map((event, i) => {
              // Layer moments count from where the scene's own clock starts (the overlap); the whoosh from its cut.
              const frame = Math.round((event.name === 'whoosh' ? lead / fps + event.at : event.at) * fps);
              return (
                <Sequence key={`sfx${i}`} from={Math.max(0, frame)} durationInFrames={Math.round(fps * 0.8)} layout="none">
                  <Audio src={SFX_URL(event.name)} volume={sfxVolume * event.volume} />
                </Sequence>
              );
            })}
            {scene.voAudio?.url && (
              <Sequence from={lead} durationInFrames={sceneFrames(scene, fps)} layout="none">
                <Audio src={scene.voAudio.url} />
              </Sequence>
            )}
            {words?.length > 0 && (
              <Sequence from={lead} durationInFrames={sceneFrames(scene, fps)}>
                <Captions words={words} s={style} captionStyle={audio?.captionStyle} />
              </Sequence>
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
