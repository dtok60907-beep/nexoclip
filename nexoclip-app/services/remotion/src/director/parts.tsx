import {interpolate, spring, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {theme} from './theme';

export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

// 0→1 between two frames with an ease-in-out curve.
export const useProgress = (start: number, end: number) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [start, end], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});
};

// Spring that starts at `at`; 0 before it.
export const usePop = (at: number, damping = 16) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return frame < at ? 0 : spring({frame: frame - at, fps, config: {damping}});
};

type Point = {x: number; y: number};
type Move = {to: Point; start: number; dur: number; click?: number};

// Synthetic cursor: eased moves through a list of waypoints, ripple on each click frame.
export const Cursor: React.FC<{from: Point; moves: Move[]; show: [number, number]}> = ({from, moves, show}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (frame < show[0] || frame > show[1]) return null;

  let pos = from;
  for (const m of moves) {
    const t = interpolate(frame, [m.start, m.start + m.dur], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});
    pos = {x: pos.x + (m.to.x - pos.x) * t, y: pos.y + (m.to.y - pos.y) * t};
  }
  const opacity = interpolate(frame, [show[0], show[0] + 6, show[1] - 6, show[1]], [0, 1, 1, 0], clamp);

  const ripples = moves
    .filter((m) => m.click !== undefined && frame >= m.click && frame < m.click + 18)
    .map((m) => {
      const r = spring({frame: frame - m.click!, fps, config: {damping: 18}, durationInFrames: 18});
      return (
        <div
          key={m.click}
          style={{
            position: 'absolute', left: m.to.x, top: m.to.y, transform: 'translate(-50%,-50%)',
            width: 14 + r * 70, height: 14 + r * 70, borderRadius: '50%',
            border: `3px solid ${theme.accent}`, opacity: 1 - r,
          }}
        />
      );
    });
  const pressed = moves.some((m) => m.click !== undefined && frame >= m.click && frame < m.click + 5);

  return (
    <div style={{position: 'absolute', inset: 0, opacity, pointerEvents: 'none'}}>
      {ripples}
      <svg
        width="34" height="34" viewBox="0 0 28 28"
        style={{
          position: 'absolute', left: pos.x - 4, top: pos.y - 3,
          transform: `scale(${pressed ? 0.88 : 1})`, transformOrigin: '4px 3px',
          filter: 'drop-shadow(0 3px 4px rgba(0,0,0,.5))',
        }}
      >
        <path d="M3 2 L3 21 L9 15 L13 24 L16 23 L12 14 L20 14 Z" fill="#fff" stroke="#111" strokeWidth="1.4" />
      </svg>
    </div>
  );
};

export const Pill: React.FC<{children: React.ReactNode; tone?: 'accent' | 'dark'}> = ({children, tone = 'accent'}) => (
  <span
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999,
      fontSize: 18, fontWeight: 700, letterSpacing: 0.2,
      background: tone === 'accent' ? theme.accent : theme.panelAlt,
      color: tone === 'accent' ? theme.accentInk : theme.text,
      border: tone === 'accent' ? 'none' : `1px solid ${theme.line}`,
    }}
  >
    {children}
  </span>
);

// Loading placeholder with a moving sheen, driven by the frame (no CSS animation).
export const Shimmer: React.FC<{w: number | string; h: number; radius?: number}> = ({w, h, radius = 12}) => {
  const frame = useCurrentFrame();
  const x = ((frame * 2.2) % 140) - 40;
  return (
    <div
      style={{
        width: w, height: h, borderRadius: radius, background: theme.panelAlt,
        backgroundImage: `linear-gradient(100deg, transparent ${x}%, rgba(212,255,100,.10) ${x + 15}%, transparent ${x + 30}%)`,
      }}
    />
  );
};
