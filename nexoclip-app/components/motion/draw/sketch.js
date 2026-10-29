// The drawing kit behind Motion's drawn scenes. For every scene an AI writes the body of `function (s, ctx)`;
// it is called once per frame and draws the illustration with `s` (shapes in a hand-drawn crayon look, easing,
// effects, sound cues). Everything is a function of time, so any frame can be drawn on its own (Remotion seeks).
// Coordinates are the canvas units of the video's format (layout.js: 720 x 1280 for 9:16, 1280 x 720 for 16:9, ...);
// the caller scales the context to the real size. s.W, s.H, s.art and s.groundY tell the code its canvas.

import { drawAnimal, drawBird, drawFish, drawPerson } from './figures.js';
import { addExtras } from './extras.js';
import { makeCanvas } from './canvasFactory.js';
import { layoutOf } from './layout.js';

export { makeCanvas };

export const SKETCH_WIDTH = 720;
export const SKETCH_HEIGHT = 1280;

const COLORS = {
  paper: '#fbf6ea', red: '#e5484d', pink: '#f28cb1', orange: '#f08a24', yellow: '#f7c948', green: '#4caf50',
  teal: '#2bb3a3', blue: '#3b82f6', navy: '#1e3a8a', purple: '#8b5cf6', brown: '#8b5a2b', sky: '#9fd3f5',
  white: '#ffffff', gray: '#9ca3af',
};
// Ink follows the theme so outlines and text stay readable: dark on paper and dusk, light on night.
const INK = { paper: '#2b2622', dusk: '#2a2438', night: '#f3eee4' };

export const themeColors = (theme) => ({ ...COLORS, ink: INK[theme] || INK.paper });

// Typefaces a video can pick for its captions and lettering (story.caption.font); "hand" is the bundled one.
export const FONTS = {
  hand: 'MotionHand, "Patrick Hand", cursive',
  sans: 'MotionSans, "Helvetica Neue", Arial, sans-serif',
  rounded: 'MotionRounded, "Trebuchet MS", sans-serif',
  serif: 'MotionSerif, Georgia, serif',
  display: 'MotionDisplay, Impact, sans-serif',
  mono: 'MotionMono, "Courier New", monospace',
};
// The bundled font files (public/motion-fonts) behind each family.
export const FONT_FILES = { MotionHand: 'patrickhand.ttf', MotionSans: 'sans.ttf', MotionRounded: 'rounded.ttf', MotionSerif: 'serif.ttf', MotionDisplay: 'display.ttf', MotionMono: 'mono.ttf' };
export const fontFamilyOf = (name) => fontOf(name).split(',')[0];
export const fontOf = (name) => FONTS[name] || FONTS.hand;
const HEX6 = /^#[0-9a-f]{6}$/i;

// Still backgrounds drawn once per scene (s.backdrop) and stamped every frame.
const BACKDROPS = new Map();

// The crayon texture as a repeating tile (drawn once), so filling a shape with it costs one fill per frame.
const TILES = new Map();
function hatchTile(paleFill) {
  if (TILES.has(paleFill)) return TILES.get(paleFill);
  const size = 192;
  const canvas = makeCanvas(size, size);
  if (!canvas) { TILES.set(paleFill, null); return null; }
  const g = canvas.getContext('2d');
  g.strokeStyle = paleFill ? 'rgba(90,80,70,0.16)' : 'rgba(255,255,255,0.32)';
  g.lineWidth = 1.6;
  g.lineCap = 'round';
  const dx = 0.42, gap = 8; // strokes lean up and to the right; the tile wraps seamlessly every `size`
  g.beginPath();
  for (let x = -size, i = 0; x < size * 2; x += gap, i += 1) {
    let along = 0;
    while (along < size) {
      const dash = 14 + hash(i * 13 + along) * 46, skip = 4 + hash(i * 17 + along) * 22;
      const a = along, b2 = Math.min(size, along + dash);
      for (const shift of [-size, 0, size]) {
        g.moveTo(x + shift + (size - a) * dx, a);
        g.lineTo(x + shift + (size - b2) * dx, b2);
      }
      along += dash + skip;
    }
  }
  g.stroke();
  TILES.set(paleFill, canvas);
  return canvas;
}

// Deterministic 0..1 from a number (integers and fractions both spread well).
export function hash(n) {
  let x = Math.imul(Math.round(n * 9973) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Whether a fill colour is light enough that white crayon strokes would vanish on it (#rgb, #rrggbb, rgb(a)).
function pale(color) {
  const text = String(color || '').trim();
  let rgb = null;
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (d) => d + d) : hex[1];
    rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  } else {
    const m = text.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (m) rgb = m.slice(1, 4).map(Number);
  }
  return rgb ? (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 > 0.8 : false;
}

// The contract offers out / inOut / back / elastic; models also reach for linear and in, so those work too.
const ease = {
  linear: (x) => x,
  in: (x) => x ** 3,
  out: (x) => 1 - (1 - x) ** 3,
  inOut: (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
  back: (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2,
  elastic: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
};

// ---- geometry: every shape becomes a list of points, then gets the hand-drawn treatment ----

function resample(points, closed, step = 12) {
  const out = [];
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const parts = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / step));
    for (let k = 0; k < parts; k += 1) out.push([x1 + (x2 - x1) * k / parts, y1 + (y2 - y1) * k / parts]);
  }
  if (!closed && points.length) out.push(points[points.length - 1]);
  return out;
}

// Catmull-Rom through the points (open or closed).
function spline(points, closed, perSegment = 10) {
  if (points.length < 3) return points;
  const at = (i) => (closed ? points[(i + points.length) % points.length] : points[clamp(i, 0, points.length - 1)]);
  const out = [];
  const segments = closed ? points.length : points.length - 1;
  for (let i = 0; i < segments; i += 1) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let k = 0; k < perSegment; k += 1) {
      const t = k / perSegment, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((d) => 0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2
        + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  if (!closed) out.push(points[points.length - 1]);
  return out;
}

function ellipsePoints(cx, cy, rx, ry, a0 = 0, a1 = Math.PI * 2) {
  const n = Math.max(12, Math.ceil(Math.abs(a1 - a0) * Math.max(rx, ry) / 8));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + (a1 - a0) * i / n;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });
}

function rectPoints(x, y, w, h, r = 0) {
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  r = clamp(r, 0, Math.min(w, h) / 2);
  if (!r) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const corner = (cx, cy, a) => ellipsePoints(cx, cy, r, r, a, a + Math.PI / 2).slice(0, -1);
  return [...corner(x + w - r, y + r, -Math.PI / 2), ...corner(x + w - r, y + h - r, 0),
    ...corner(x + r, y + h - r, Math.PI / 2), ...corner(x + r, y + r, Math.PI)];
}

const lengthOf = (pts) => pts.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

// The first `fraction` of a polyline by length.
function partOf(pts, fraction) {
  if (fraction >= 1) return pts;
  const target = lengthOf(pts) * fraction;
  const out = [pts[0]];
  let run = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (run + d >= target) {
      const k = d ? (target - run) / d : 0;
      out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]);
      return out;
    }
    run += d;
    out.push(pts[i]);
  }
  return out;
}

// Smooth hand jitter: offsets keyed every ~40px along the line and eased in between, so lines waver, not buzz.
function jitter(pts, amount, seed) {
  if (!amount) return pts;
  let run = 0;
  return pts.map((p, i) => {
    if (i) run += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const u = run / 40, k = Math.floor(u), f = u - k, s = (1 - Math.cos(f * Math.PI)) / 2;
    const n = (axis) => (hash(seed + k * 31 + axis) * (1 - s) + hash(seed + (k + 1) * 31 + axis) * s - 0.5) * 2 * amount;
    return [p[0] + n(1), p[1] + n(2)];
  });
}

function trace(ctx, pts, closed) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (closed) ctx.closePath();
}

// The hand-drawn version of a shape depends only on its points and wobble, so it is worked out once and kept
// (with Path2D objects where the canvas has them): a scene redraws the same shapes every frame.
const GEOMETRY = new Map();
const GEOMETRY_MAX = 2500;
const HAS_PATH2D = () => typeof Path2D !== 'undefined';
function toPath(pts, closed) {
  if (!HAS_PATH2D()) return null;
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  if (closed) p.closePath();
  return p;
}
function geometry(raw, closed, wobble, seed) {
  let id = `${closed ? 1 : 0}|${wobble}|${seed}|`;
  for (const [x, y] of raw) id += `${Math.round(x * 4)},${Math.round(y * 4)};`;
  const hit = GEOMETRY.get(id);
  if (hit) return hit;
  const key = keyOf(raw);
  const dense = resample(raw, closed);
  const fillPts = jitter(dense, wobble * 0.6, seed + key);
  const lineRaw = jitter(dense, wobble, seed + key * 3);
  const linePts = closed ? [...lineRaw, lineRaw[0]] : lineRaw;
  const line2Pts = jitter(linePts, wobble * 0.8, seed + key * 5);
  const g = { key, fillPts, linePts, line2Pts, fill: toPath(fillPts, true), line: toPath(linePts, false), line2: toPath(line2Pts, false) };
  if (GEOMETRY.size >= GEOMETRY_MAX) GEOMETRY.delete(GEOMETRY.keys().next().value);
  GEOMETRY.set(id, g);
  return g;
}
function keyOf(pts) {
  return pts.slice(0, 4).reduce((sum, [x, y], i) => sum + Math.round(x / 8) * (i + 3) + Math.round(y / 8) * (i + 7), pts.length);
}
function fillPath(ctx, path, pts) { if (path && ctx.fill.length !== undefined) { try { ctx.fill(path); return; } catch { /* fall back */ } } trace(ctx, pts, true); ctx.fill(); }
function strokePath(ctx, path, pts) { if (path) { try { ctx.stroke(path); return; } catch { /* fall back */ } } trace(ctx, pts, false); ctx.stroke(); }

// `look` is the drawing style (story.js DRAW_STYLES): wobble and outline multipliers, crayon texture on or off, chalk.
// The free canvas (story.canvas 2) adds: `palette` { ink, colors } of the video, `cast` { name: fn(s, o) } the
// characters the AI designed for it, `screen` (the context's transform before the camera, for s.backdrop),
// `stillKey` (names this scene's cached backdrop), `font` (the video's typeface) and `safe` (the area free of
// the caption).
export function createSketch({ ctx, t, dur, theme = 'paper', seed = 1, onSfx = null, look = {}, onMissing = null, dark = null, format = '9:16', palette = null, cast = null, screen = null, stillKey = '', font = 'hand', safe = null }) {
  const L = layoutOf(format);
  const c = themeColors(theme);
  if (dark !== null) c.ink = dark ? INK.night : INK.paper; // a custom look: ink follows how dark it is
  if (HEX6.test(palette?.ink || '')) c.ink = palette.ink;
  const pal = (palette?.colors || []).filter((x) => HEX6.test(x));
  const family = fontOf(font);
  const wobbleBy = look.wobble ?? 1, outlineBy = look.outline ?? 1, hatchOn = look.hatch !== false;
  if (look.chalk) c.ink = '#f4f1e8';
  const opt = (o) => o || {};

  // Crayon texture over the fill (grey strokes on pale fills, white on the rest), from a cached tile.
  function hatch(g, fill) {
    const tile = hatchTile(pale(fill));
    if (!tile) return;
    const pattern = ctx.createPattern(tile, 'repeat');
    if (!pattern) return;
    ctx.fillStyle = pattern;
    fillPath(ctx, g.fill, g.fillPts);
  }

  function pen(pts, color) {
    const [x, y] = pts[pts.length - 1];
    ctx.save();
    ctx.shadowColor = color === true ? '#fff7c2' : color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = color === true ? '#fffbe6' : color;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // One shape, hand-drawn: wobbly fill with crayon texture, then a wobbly ink outline (drawn progressively with `draw`).
  function paint(raw, closed, o = {}) {
    if (!raw.length) return;
    const draw = o.draw === undefined ? 1 : clamp(o.draw, 0, 1);
    if (draw <= 0) return;
    const wobble = (o.wobble ?? 1) * 1.6 * wobbleBy;
    const g = geometry(raw, closed, wobble, seed);
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    if (closed && o.fill && o.fill !== 'none') {
      ctx.save();
      ctx.globalAlpha *= draw;
      ctx.fillStyle = o.fill;
      fillPath(ctx, g.fill, g.fillPts);
      if (hatchOn && o.hatch !== false) hatch(g, o.fill);
      ctx.restore();
    }
    const stroke = o.stroke ?? c.ink;
    // outline 0 (the flat style) leaves shape edges off; plain lines (no fill) keep a thin stroke so they still show
    const width = (o.width ?? 3) * (outlineBy > 0 ? outlineBy : closed && o.fill && o.fill !== 'none' ? 0 : 0.8);
    if (stroke !== 'none' && width > 0) {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      if (look.chalk) { ctx.globalAlpha *= 0.85; ctx.setLineDash([9, 2.5]); }
      const part = draw < 1 ? partOf(g.linePts, draw) : null;
      if (part) { trace(ctx, part, false); ctx.stroke(); } else strokePath(ctx, g.line, g.linePts);
      ctx.setLineDash([]);
      if (width >= 2 && wobble > 0 && !o.single) { // a lighter second pass makes the line read as crayon, not vector
        ctx.globalAlpha *= 0.35;
        ctx.lineWidth = width * 0.55;
        if (part) { trace(ctx, jitter(part, wobble * 0.8, seed + g.key * 5), false); ctx.stroke(); } else strokePath(ctx, g.line2, g.line2Pts);
      }
      if (o.pen && part) pen(part, o.pen);
    }
    ctx.restore();
  }

  const s = {
    t, dur, p: dur > 0 ? clamp(t / dur, 0, 1) : 1, theme, c, ease,
    W: L.w, H: L.h, art: safe || L.art, groundY: L.ground, cx: L.center[0], cy: L.center[1], format, pal,
    safe: safe || L.art,
    at: (start, len = 0.6) => ease.out(clamp((t - start) / (len || 1e-6), 0, 1)),
    pop: (start, len = 0.5) => { const x = clamp((t - start) / (len || 1e-6), 0, 1); return x <= 0 ? 0 : ease.back(x); },
    lerp: (a, b, k) => a + (b - a) * k,
    clamp,
    wave: (freq = 1, amp = 1, phase = 0) => Math.sin(t * freq * Math.PI * 2 + phase) * amp,
    rand: (i = 0) => hash(seed * 7919 + i),

    line: (x1, y1, x2, y2, o) => paint([[x1, y1], [x2, y2]], false, opt(o)),
    polyline: (pts, o) => paint(pts || [], false, opt(o)),
    shape: (pts, o) => paint(pts || [], true, opt(o)),
    curve: (pts, o) => { const k = opt(o); paint(spline(pts || [], !!k.closed), !!k.closed, k); },
    rect: (x, y, w, h, o) => { const k = opt(o); paint(rectPoints(x, y, w, h, k.r || 0), true, k); },
    circle: (cx, cy, r, o) => paint(ellipsePoints(cx, cy, Math.abs(r), Math.abs(r)).slice(0, -1), true, opt(o)),
    ellipse: (cx, cy, rx, ry, o) => paint(ellipsePoints(cx, cy, Math.abs(rx), Math.abs(ry)).slice(0, -1), true, opt(o)),
    arc: (cx, cy, r, a0, a1, o) => paint(ellipsePoints(cx, cy, Math.abs(r), Math.abs(r), a0, a1), false, opt(o)),

    text(str, x, y, o) {
      const k = opt(o);
      ctx.save();
      ctx.globalAlpha *= k.alpha ?? 1;
      ctx.font = `${k.weight ? `${k.weight} ` : ''}${k.size || 32}px ${k.font ? fontOf(k.font) : family}`;
      ctx.textAlign = k.align || 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = k.color || c.ink;
      ctx.fillText(String(str ?? ''), x, y);
      ctx.restore();
    },
    // Bold lettering with a drop shadow, for a key word that is part of the picture.
    text3d(str, x, y, o) {
      const k = opt(o);
      s.group({ x, y, rotate: k.rotate || 0, scale: k.scale ?? 1 }, () => {
        s.text(str, 4, 5, { ...k, color: 'rgba(0,0,0,0.25)' });
        s.text(str, 0, 0, k);
      });
    },
    tag(str, x, y, o) {
      const k = opt(o);
      const size = k.size || 28;
      ctx.save();
      ctx.font = `${size}px ${family}`;
      const w = ctx.measureText(String(str)).width + size;
      ctx.restore();
      s.group({ x, y, rotate: k.rotate || 0, scale: k.scale ?? 1, alpha: k.alpha ?? 1 }, () => {
        s.rect(-w / 2, -size * 0.75, w, size * 1.5, { fill: k.fill || c.yellow, r: size * 0.75 });
        s.text(str, 0, 0, { size, color: k.color || '#2b2622' });
      });
    },
    photo: () => {},

    check: (x, y, size, o) => paint([[x - size * 0.45, y], [x - size * 0.12, y + size * 0.32], [x + size * 0.5, y - size * 0.38]], false,
      { width: Math.max(3, size / 9), ...opt(o) }),
    cross(x, y, size, o) {
      const k = { width: Math.max(3, size / 9), ...opt(o) };
      const h = size / 2;
      const d = k.draw === undefined ? 1 : k.draw;
      paint([[x - h, y - h], [x + h, y + h]], false, { ...k, draw: clamp(d * 2, 0, 1) });
      if (d > 0.5) paint([[x + h, y - h], [x - h, y + h]], false, { ...k, draw: clamp(d * 2 - 1, 0, 1) });
    },
    dash(x1, y1, x2, y2, o) {
      const k = opt(o);
      const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / 22));
      for (let i = 0; i < n; i += 1) {
        const a = i / n, b = (i + 0.55) / n;
        paint([[x1 + (x2 - x1) * a, y1 + (y2 - y1) * a], [x1 + (x2 - x1) * b, y1 + (y2 - y1) * b]], false, { wobble: 0.3, ...k });
      }
    },
    sparkle(x, y, size, o) {
      const k = opt(o);
      const pts = Array.from({ length: 8 }, (_, i) => {
        const a = i * Math.PI / 4 - Math.PI / 2, r = i % 2 ? size * 0.22 : size * 0.5;
        return [x + Math.cos(a) * r, y + Math.sin(a) * r];
      });
      paint(pts, true, { fill: k.fill || c.yellow, stroke: k.stroke || c.ink, width: 2, wobble: 0.3, hatch: false, ...k });
    },
    rays(cx, cy, r1, r2, count = 8, o) {
      const k = opt(o);
      const d = k.draw === undefined ? 1 : clamp(k.draw, 0, 1);
      if (d <= 0) return;
      for (let i = 0; i < count; i += 1) {
        const a = i / count * Math.PI * 2;
        const r = r1 + (r2 - r1) * d;
        paint([[cx + Math.cos(a) * r1, cy + Math.sin(a) * r1], [cx + Math.cos(a) * r, cy + Math.sin(a) * r]], false,
          { stroke: c.yellow, width: 3, wobble: 0.4, ...k, draw: 1 });
      }
    },
    // A quick flash of energy lines: unseen at draw 0, flies out, gone at draw 1.
    burst(x, y, r, o) {
      const k = opt(o);
      const d = clamp(k.draw ?? 0, 0, 1);
      if (d <= 0 || d >= 1) return;
      const count = k.count || 10;
      const e = ease.out(d);
      for (let i = 0; i < count; i += 1) {
        const a = i / count * Math.PI * 2 + hash(seed + i) * 0.3;
        const inner = r * (0.35 + 0.65 * e), outer = inner + r * 0.38 * (1 - d);
        paint([[x + Math.cos(a) * inner, y + Math.sin(a) * inner], [x + Math.cos(a) * outer, y + Math.sin(a) * outer]], false,
          { stroke: k.stroke || c.ink, width: 2 + 3 * (1 - d), wobble: 0.3, alpha: 1 - d * d });
      }
    },
    ground: (y = L.ground, x1 = L.art[0] + 20, x2 = L.art[2] - 20, o) => paint([[x1, y], [x2, y]], false, { width: 3, ...opt(o) }),
    // Kept so older scene code still runs; it draws nothing (a guiding dot looked out of place).
    glow: () => {},
    group(o, fn) {
      const k = opt(o);
      ctx.save();
      ctx.translate(k.x || 0, k.y || 0);
      if (k.rotate) ctx.rotate(k.rotate);
      const scale = Number.isFinite(k.scale) ? k.scale : 1;
      if (scale !== 1) ctx.scale(scale, scale);
      ctx.globalAlpha *= clamp(k.alpha ?? 1, 0, 1);
      try { fn?.(); } finally { ctx.restore(); }
    },
    // People and animals (figures.js): posed or moving, in the same crayon look.
    person: (x, y, size, o) => drawPerson(s, x, y, size, opt(o)),
    animal: (kind, x, y, size, o) => drawAnimal(s, kind, x, y, size, opt(o)),
    bird: (x, y, size, o) => drawBird(s, x, y, size, opt(o)),
    fish: (x, y, size, o) => drawFish(s, x, y, size, opt(o)),
    // The scene's background, drawn over the whole frame and not moved by the camera. Drawn once and reused
    // unless `animated` (then every frame, from s.t like the rest).
    backdrop(fn, o) {
      const k = opt(o);
      ctx.save();
      if (screen) ctx.setTransform(screen);
      try {
        const key = !k.animated && stillKey ? `${stillKey}|${L.w}x${L.h}` : '';
        let still = key ? BACKDROPS.get(key) : undefined;
        if (key && still === undefined) {
          const scale = 1.5;
          const canvas = makeCanvas(L.w * scale, L.h * scale);
          if (canvas) {
            const g = canvas.getContext('2d');
            g.scale(scale, scale);
            const inner = createSketch({ ctx: g, t: 0, dur, theme, seed, look, dark, format, palette, cast, stillKey: '', font, safe });
            fn?.(inner, g);
          }
          still = canvas || null;
          if (BACKDROPS.size > 60) BACKDROPS.delete(BACKDROPS.keys().next().value);
          BACKDROPS.set(key, still);
        }
        if (still) ctx.drawImage(still, 0, 0, L.w, L.h);
        else fn?.(s, ctx);
      } finally { ctx.restore(); }
    },
    // A character this video's AI designed (story.cast): drawn about `size` tall standing on (x, y), facing
    // right (o.facing -1 flips), with its own poses and moves (o.pose / o.action, o.mood, o.t local time).
    cast(name, x, y, size = 260, o) {
      const k = opt(o);
      const draw = cast?.[name];
      if (!draw) { onMissing?.('cast', name); return s.person(x, y, size, k); }
      ctx.save();
      ctx.translate(x, y);
      if (k.rotate) ctx.rotate(k.rotate);
      ctx.scale((k.facing === -1 ? -1 : 1) * size / 100, size / 100);
      ctx.globalAlpha *= clamp(k.alpha ?? 1, 0, 1);
      try { draw(s, { t, ...k }); } finally { ctx.restore(); }
    },
    // A recurring object this video's AI designed (story.cast kind "prop"): drawn about `size` wide centred on
    // (x, y), with its own states (o.state, o.t).
    prop(name, x, y, size = 160, o) {
      const k = opt(o);
      const draw = cast?.[name];
      if (!draw) { onMissing?.('prop', name); return; }
      ctx.save();
      ctx.translate(x, y);
      if (k.rotate) ctx.rotate(k.rotate);
      ctx.scale((k.facing === -1 ? -1 : 1) * size / 100, size / 100);
      ctx.globalAlpha *= clamp(k.alpha ?? 1, 0, 1);
      try { draw(s, { t, ...k }); } finally { ctx.restore(); }
    },
    sfx(name, time = 0, gain = 1, pitch) {
      onSfx?.({ name: String(name), time: Number(time) || 0, gain: Number.isFinite(gain) ? gain : 1, pitch: Number.isFinite(pitch) ? pitch : 1 });
    },
  };
  return addExtras(s, ctx, { onMissing });
}

// The scene code as a function (s, ctx). Throws on a syntax error; the caller decides what to show.
// A short key for a piece of code (names a scene's cached backdrop, so new code draws a new one).
export function codeKey(code) {
  let h = 5381;
  const text = String(code || '');
  for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// A cast member's code as a function (s, o): draws the character about 100 units tall standing on (0, 0).
export function compileCast(code) {
  // eslint-disable-next-line no-new-func
  return new Function('s', 'o', String(code || ''));
}

export function compileScene(code) {
  // eslint-disable-next-line no-new-func
  return new Function('s', 'ctx', String(code || ''));
}

// Split an answer with characters ("// ===== CAST Name =====" markers) into { Name: code }.
export function splitCast(answer) {
  const text = String(answer || '').replace(/^```(?:js|javascript)?\s*$/gim, '');
  const out = {};
  const marker = /^\s*\/\/\s*=+\s*(?:CAST|PROP)\s+(.+?)\s*=+\s*$/gim;
  const found = [...text.matchAll(marker)];
  found.forEach((m, i) => {
    out[m[1].trim()] = text.slice(m.index + m[0].length, i + 1 < found.length ? found[i + 1].index : text.length).trim();
  });
  return out;
}

// Split one answer that holds several scenes ("// ===== SCENE 3 =====" markers) into { 3: code, ... }.
export function splitScenes(answer) {
  const text = String(answer || '').replace(/^```(?:js|javascript)?\s*$/gim, '');
  const out = {};
  const marker = /^\s*\/\/\s*=+\s*SCENE\s+(\d+)\s*=+\s*$/gim;
  const found = [...text.matchAll(marker)];
  found.forEach((m, i) => {
    out[Number(m[1])] = text.slice(m.index + m[0].length, i + 1 < found.length ? found[i + 1].index : text.length).trim();
  });
  return out;
}
