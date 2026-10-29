// The animation library a Motion layer can use: entrances, emphasis loops and exits. The keyframes and easing
// curves are adapted from OpenMotion's template library (https://github.com/Yuan-ManX/open-motion,
// MIT License, Copyright (c) 2026 Yuan-Man), turned from CSS keyframes into frame-driven values for Remotion.
//
// A keyframe is [offset 0..1, props]. Props: o (opacity), x / y (px at 1080 wide), yp (% of the element's own
// height), s (scale), r (rotate, deg), ry (rotateY, deg), blur (px), clip (right inset, %). Between two keyframes the
// animation's easing shapes the move, as CSS does.

// Cubic-bezier easing (the CSS timing function), solved for x by Newton steps with a bisection fallback. Kept here
// instead of Remotion's Easing so the catalogue also loads on the server (the AI director validates against it).
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1; const bx = 3 * (x2 - x1) - cx; const ax = 1 - cx - bx;
  const cy = 3 * y1; const by = 3 * (y2 - y1) - cy; const ay = 1 - cy - by;
  const xAt = (t) => ((ax * t + bx) * t + cx) * t;
  const yAt = (t) => ((ay * t + by) * t + cy) * t;
  const dxAt = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const dx = dxAt(t);
      if (Math.abs(dx) < 1e-6) break;
      const next = t - (xAt(t) - x) / dx;
      if (next < 0 || next > 1) break;
      t = next;
    }
    if (Math.abs(xAt(t) - x) > 1e-4) {
      let lo = 0; let hi = 1;
      for (let i = 0; i < 30; i += 1) { t = (lo + hi) / 2; if (xAt(t) < x) lo = t; else hi = t; }
    }
    return yAt(t);
  };
}
const Easing = { bezier };

export const EASINGS = {
  linear: (t) => t,
  'ease-in': Easing.bezier(0.42, 0, 1, 1),
  'ease-out': Easing.bezier(0, 0, 0.58, 1),
  'ease-in-out': Easing.bezier(0.42, 0, 0.58, 1),
  'ease-in-quad': Easing.bezier(0.11, 0, 0.5, 0),
  'ease-out-cubic': Easing.bezier(0.33, 1, 0.68, 1),
  'ease-in-cubic': Easing.bezier(0.32, 0, 0.67, 0),
  bounce: Easing.bezier(0.68, -0.6, 0.32, 1.6),
  back: Easing.bezier(0.34, 1.56, 0.64, 1),
  elastic: Easing.bezier(0.5, -0.6, 0.1, 1.4),
  snappy: Easing.bezier(0.2, 0.8, 0.2, 1),
  smooth: Easing.bezier(0.45, 0, 0.15, 1),
  spring: Easing.bezier(0.34, 1.56, 0.64, 1),
};

const anim = (label, seconds, easing, keyframes, extra = {}) => ({ label, seconds, easing, keyframes, ...extra });

// Entrances: play once from the layer's start.
export const ENTRANCES = {
  fade: anim('Muncul pelan', 0.8, 'ease-out', [[0, { o: 0 }], [1, { o: 1 }]]),
  'slide-up': anim('Naik', 0.7, 'ease-out-cubic', [[0, { y: 40, o: 0 }], [1, { y: 0, o: 1 }]]),
  bounce: anim('Jatuh memantul', 0.9, 'bounce', [[0, { y: -120, o: 0 }], [0.6, { y: 12, o: 1 }], [1, { y: 0 }]]),
  scale: anim('Membesar', 0.6, 'back', [[0, { s: 0, o: 0 }], [1, { s: 1, o: 1 }]]),
  flip: anim('Putar 3D', 0.8, 'ease-out-cubic', [[0, { ry: 90, o: 0 }], [1, { ry: 0, o: 1 }]]),
  spring: anim('Pegas', 1, 'spring', [[0, { s: 0.2, o: 0 }], [0.5, { s: 1.1, o: 1 }], [1, { s: 1 }]]),
  elastic: anim('Karet', 0.8, 'elastic', [[0, { s: 0, o: 0 }], [0.2, { s: 1.2, o: 0.8 }], [0.35, { s: 0.9, o: 1 }], [0.5, { s: 1.08 }], [0.65, { s: 0.97 }], [0.8, { s: 1.02 }], [1, { s: 1, o: 1 }]]),
  drop: anim('Jatuh gravitasi', 1.2, 'ease-in', [[0, { yp: -300, o: 0, s: 0.8 }], [0.15, { o: 1, s: 1 }], [0.4, { yp: 0, s: 1 }], [0.55, { yp: -15, s: 1.05 }], [0.7, { yp: 0, s: 0.98 }], [0.82, { yp: -5, s: 1.02 }], [0.92, { yp: 0, s: 0.99 }], [1, { yp: 0, s: 1 }]]),
  anticipation: anim('Ancang-ancang', 0.85, 'spring', [[0, { s: 1, yp: 0, o: 0 }], [0.28, { s: 0.86, yp: 0, o: 1 }], [0.5, { s: 1.12, yp: -12, o: 1 }], [0.72, { s: 0.97, yp: 0, o: 1 }], [1, { s: 1, yp: 0, o: 1 }]]),
  blur: anim('Fokus dari blur', 1.6, 'ease-out', [[0, { o: 0, blur: 20, s: 1.1 }], [0.4, { o: 0.4, blur: 10, s: 1.05 }], [0.7, { o: 0.8, blur: 4, s: 1.02 }], [1, { o: 1, blur: 0, s: 1 }]]),
  wipe: anim('Sapuan', 1.4, 'ease-in-out', [[0, { clip: 100 }], [0.5, { clip: 50 }], [1, { clip: 0 }]]),
  'reveal-3d': anim('Buka 3D', 1, 'ease-out', [[0, { ry: 90, s: 0.8, o: 0 }], [0.3, { ry: 45, s: 0.9, o: 0.5 }], [0.6, { ry: 15, s: 0.95, o: 0.8 }], [1, { ry: 0, s: 1, o: 1 }]]),
  book: anim('Halaman buku', 1.4, 'ease-out-cubic', [[0, { ry: -170, s: 0.9, o: 0.3 }], [0.55, { ry: -20, s: 0.98, o: 1 }], [0.8, { ry: 3, s: 1, o: 1 }], [1, { ry: 0, s: 1, o: 1 }]], { origin: 'left center' }),
  // Per word / per character: the keyframes play on each word, one after another.
  words: anim('Kata per kata', 0.6, 'snappy', [[0, { y: 40, o: 0 }], [1, { y: 0, o: 1 }]], { split: 'word', stagger: 0.08 }),
  'words-pop': anim('Kata meletup', 0.9, 'ease-out', [[0, { s: 0.3, o: 0 }], [0.6, { s: 1.1, o: 1 }], [1, { s: 1, o: 1 }]], { split: 'word', stagger: 0.12 }),
  type: anim('Mesin ketik', 1.5, 'linear', [], { split: 'type' }),
  scramble: anim('Acak jadi teks', 1.8, 'linear', [], { split: 'scramble' }),
};

// Emphasis loops: repeat from the end of the entrance until the scene ends.
export const LOOPS = {
  pulse: anim('Denyut', 1.2, 'ease-in-out', [[0, { s: 1, o: 0.85 }], [1, { s: 1.12, o: 1 }]], { alternate: true }),
  heartbeat: anim('Detak jantung', 1.2, 'snappy', [[0, { s: 1 }], [0.05, { s: 0.88 }], [0.12, { s: 1.14 }], [0.18, { s: 1 }], [0.22, { s: 0.92 }], [0.28, { s: 1.08 }], [0.34, { s: 1 }], [1, { s: 1 }]]),
  float: anim('Melayang', 3.2, 'smooth', [[0, { yp: 0 }], [0.5, { yp: -18 }], [1, { yp: 0 }]]),
  glitch: anim('Glitch', 0.6, 'linear', [[0, { x: 0, o: 1, s: 1 }], [0.1, { x: -4, o: 0.8, s: 1.02 }], [0.15, { x: 3, o: 1, s: 0.98 }], [0.2, { x: -2, o: 0.6 }], [0.25, { x: 0, o: 1, s: 1 }], [0.5, { x: 0, o: 1 }], [0.55, { x: 5, o: 0.5, s: 1.05 }], [0.6, { x: -3, o: 1, s: 1 }], [0.65, { x: 2, o: 0.7 }], [0.7, { x: 0, o: 1, s: 1 }], [1, { x: 0, o: 1, s: 1 }]], { every: 2.4 }),
  flicker: anim('Neon berkedip', 2.5, 'linear', [[0, { o: 1 }], [0.05, { o: 0.8 }], [0.07, { o: 0.2 }], [0.1, { o: 0.9 }], [0.12, { o: 0.3 }], [0.15, { o: 0.8 }], [0.22, { o: 0.95 }], [0.25, { o: 0.5 }], [0.3, { o: 0.9 }], [0.4, { o: 1 }], [1, { o: 1 }]], { every: 4 }),
  beat: anim('Ketukan', 2, 'snappy', [[0, { s: 1, y: 0 }], [0.015, { s: 1.14, y: -6 }], [0.04, { s: 1, y: 0 }], [0.25, { s: 1 }], [0.265, { s: 1.06, y: -2 }], [0.29, { s: 1, y: 0 }], [0.5, { s: 1 }], [0.515, { s: 1.1, y: -4 }], [0.54, { s: 1, y: 0 }], [0.75, { s: 1 }], [0.765, { s: 1.06, y: -2 }], [0.79, { s: 1, y: 0 }], [1, { s: 1, y: 0 }]]),
  shake: anim('Getar', 0.5, 'linear', [[0, { x: 0 }], [0.15, { x: -10 }], [0.3, { x: 9 }], [0.45, { x: -7 }], [0.6, { x: 5 }], [0.75, { x: -3 }], [1, { x: 0 }]], { every: 2 }),
  wiggle: anim('Goyang', 0.5, 'spring', [[0, { s: 1 }], [0.3, { s: 1.15 }], [0.6, { s: 0.95 }], [1, { s: 1 }]], { every: 1.8 }),
};

// Exits: end exactly at the end of the scene.
export const EXITS = {
  'fade-out': anim('Memudar', 0.6, 'ease-in', [[0, { o: 1 }], [1, { o: 0 }]]),
  'slide-out': anim('Geser keluar', 0.5, 'ease-in-quad', [[0, { x: 0, o: 1 }], [1, { x: 120, o: 0 }]]),
  'zoom-out': anim('Mengecil jauh', 0.7, 'ease-in-out', [[0, { s: 1, o: 1 }], [0.6, { s: 0.9, o: 0.7 }], [1, { s: 0.3, o: 0 }]]),
  dissolve: anim('Larut blur', 0.8, 'smooth', [[0, { o: 1, blur: 0 }], [0.4, { o: 0.8, blur: 2 }], [0.7, { o: 0.4, blur: 6 }], [1, { o: 0, blur: 12 }]]),
  sink: anim('Tenggelam', 0.52, 'ease-in-cubic', [[0, { y: 0, o: 1 }], [0.5, { y: 40, o: 0.85 }], [1, { y: 140, o: 0 }]]),
  rise: anim('Naik keluar', 0.48, 'ease-in-quad', [[0, { y: 0, o: 1 }], [0.6, { y: -40, o: 0.6 }], [1, { y: -120, o: 0 }]]),
  'spin-out': anim('Putar keluar', 0.6, 'ease-in-cubic', [[0, { r: 0, s: 1, o: 1 }], [0.5, { r: 45, s: 0.7, o: 0.6 }], [1, { r: 90, s: 0, o: 0 }]]),
  collapse: anim('Kempis', 0.9, 'elastic', [[0, { s: 1, o: 1 }], [0.3, { s: 0.85, o: 0.9 }], [0.5, { s: 1.05, o: 0.8 }], [1, { s: 0, o: 0 }]]),
};

const DEFAULTS = { o: 1, x: 0, y: 0, yp: 0, s: 1, r: 0, ry: 0, blur: 0, clip: 0 };

// The props of one animation `t` (0..1) of the way through.
export function sample(animation, t) {
  const ease = EASINGS[animation.easing] || EASINGS.linear;
  const out = {};
  for (const prop of Object.keys(DEFAULTS)) {
    const frames = animation.keyframes.filter(([, props]) => prop in props);
    if (!frames.length) continue;
    if (t <= frames[0][0]) { out[prop] = frames[0][1][prop]; continue; }
    const last = frames[frames.length - 1];
    if (t >= last[0]) { out[prop] = last[1][prop]; continue; }
    const next = frames.findIndex(([offset]) => offset >= t);
    const [a, from] = frames[next - 1];
    const [b, to] = frames[next];
    const k = ease((t - a) / (b - a));
    out[prop] = from[prop] + (to[prop] - from[prop]) * k;
  }
  return out;
}

// Several samples (entrance × loop × exit) into one: opacity and scale multiply, offsets add.
export function combine(...parts) {
  const out = { ...DEFAULTS };
  for (const part of parts) {
    if (!part) continue;
    for (const [prop, value] of Object.entries(part)) {
      if (prop === 'o' || prop === 's') out[prop] *= value;
      else if (prop === 'clip' || prop === 'blur') out[prop] = Math.max(out[prop], value);
      else out[prop] += value;
    }
  }
  return out;
}

export function toStyle(props, u) {
  const transform = [
    props.ry ? `perspective(${1400 * u}px) rotateY(${props.ry}deg)` : '',
    props.x || props.y ? `translate(${props.x * u}px, ${props.y * u}px)` : '',
    props.yp ? `translateY(${props.yp}%)` : '',
    props.s !== 1 ? `scale(${props.s})` : '',
    props.r ? `rotate(${props.r}deg)` : '',
  ].filter(Boolean).join(' ');
  return {
    opacity: Math.max(0, Math.min(1, props.o)),
    transform: transform || undefined,
    filter: props.blur > 0.05 ? `blur(${props.blur * u}px)` : undefined,
    clipPath: props.clip > 0.05 ? `inset(-10% ${props.clip}% -10% -10%)` : undefined,
  };
}

// Where each animation of a layer is at `sec` seconds into the scene.
export function layerMotion({ entrance, loop, exit, start, sceneSeconds, sec }) {
  const enter = ENTRANCES[entrance];
  const parts = [];
  const enterEnd = start + (enter?.seconds || 0);
  if (enter && enter.keyframes.length) parts.push(sample(enter, Math.min(1, Math.max(0, (sec - start) / enter.seconds))));
  else if (sec < start) parts.push({ o: 0 });
  const repeat = LOOPS[loop];
  if (repeat && sec > enterEnd) {
    const period = repeat.every || repeat.seconds;
    const into = (sec - enterEnd) % period;
    if (into < repeat.seconds) {
      let t = into / repeat.seconds;
      if (repeat.alternate) t = Math.floor((sec - enterEnd) / repeat.seconds) % 2 ? 1 - t : t;
      parts.push(sample(repeat, t));
    }
  }
  const leave = EXITS[exit];
  if (leave) {
    const from = sceneSeconds - leave.seconds;
    if (sec > from) parts.push(sample(leave, Math.min(1, (sec - from) / leave.seconds)));
  }
  return combine(...parts);
}
