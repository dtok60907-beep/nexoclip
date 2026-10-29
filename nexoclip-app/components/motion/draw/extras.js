import { makeCanvas } from './canvasFactory.js';

// Ready-made pieces for drawn scenes, added to the sketch kit (sketch.js): icons (Lucide), pictures and Lottie
// animations handed in with the video, a world map (Natural Earth), and infographic/promo widgets (chart, counter,
// chat bubble, button, price tag, progress bar, timeline). Data is loaded once per video by loadExtras() and kept
// here; the scene code stays synchronous, so a frame can be drawn on its own.

let ICONS = null;
let WORLD = null;
const IMAGES = new Map(); // key → HTMLImageElement / ImageBitmap
const LOTTIES = new Map(); // key → { anim, canvas, frames, fps }
const MAPS = new Map(); // cached land layers of s.map

export const assetKeysIn = (code) => {
  const keys = { images: new Set(), lotties: new Set() };
  for (const m of String(code || '').matchAll(/s\.(image|lottie)\(\s*["'`]([^"'`]+)["'`]/g)) keys[m[1] === 'image' ? 'images' : 'lotties'].add(m[2]);
  return keys;
};

// Icons and the map always; the video's pictures and Lottie files from `assets` ({ key: { type, url | data } }).
export async function loadExtras({ assets = {} } = {}) {
  const jobs = [];
  if (!ICONS) jobs.push(import('./lucideIcons.json').then((m) => { ICONS = m.default || m; }));
  if (!WORLD) jobs.push(import('./worldMap.json').then((m) => { WORLD = m.default || m; }));
  for (const [key, asset] of Object.entries(assets || {})) {
    if (asset?.type === 'image' && asset.url && !IMAGES.has(key) && typeof Image !== 'undefined') {
      jobs.push(new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { IMAGES.set(key, img); resolve(); };
        img.onerror = () => resolve();
        img.src = asset.url;
      }));
    }
    if (asset?.type === 'lottie' && asset.data && !LOTTIES.has(key) && typeof document !== 'undefined') {
      jobs.push(import('lottie-web/build/player/lottie_light_canvas').then(({ default: lottie }) => {
        const data = asset.data;
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(1024, Number(data.w) || 512);
        canvas.height = Math.min(1024, Number(data.h) || 512);
        const anim = lottie.loadAnimation({
          renderer: 'canvas', loop: false, autoplay: false, animationData: JSON.parse(JSON.stringify(data)),
          rendererSettings: { context: canvas.getContext('2d'), clearCanvas: true, preserveAspectRatio: 'xMidYMid meet' },
        });
        LOTTIES.set(key, { anim, canvas, frames: Math.max(1, Number(data.op) - Number(data.ip)), fps: Number(data.fr) || 30 });
      }).catch(() => {}));
    }
  }
  await Promise.all(jobs);
}

// For the server-side code check: the same icon names and map, without the browser.
export function useExtrasData({ icons, world }) {
  if (icons) ICONS = icons;
  if (world) WORLD = world;
}

export const iconNames = () => (ICONS ? Object.keys(ICONS) : []);

const REGIONS = {
  world: [-170, 80, 190, -58], africa: [-20, 38, 55, -36], europe: [-25, 72, 45, 34], asia: [25, 78, 150, -12],
  'southeast-asia': [90, 28, 145, -12], indonesia: [94, 7, 142, -11.5], americas: [-170, 75, -30, -57],
  'north-america': [-170, 75, -50, 7], 'south-america': [-85, 14, -32, -57], oceania: [110, -8, 180, -48],
  'middle-east': [25, 42, 63, 12],
};

export function addExtras(s, ctx, { onMissing } = {}) {
  const clamp = s.clamp;
  const ink = () => s.c.ink;

  // An icon by its Lucide name, stroked like a marker; `fill` paints inside first. `draw` 0..1 reveals the stroke.
  s.icon = (name, x, y, size = 96, o = {}) => {
    const d = ICONS?.[String(name).replace(/^lucide:/, '')];
    if (!d) { onMissing?.('icon', name); return; }
    if (typeof Path2D === 'undefined') return; // the server-side check only needs to know the name exists
    const path = new Path2D(d);
    const k = size / 24;
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    ctx.translate(x - size / 2, y - size / 2);
    if (o.rotate) { ctx.translate(size / 2, size / 2); ctx.rotate(o.rotate); ctx.translate(-size / 2, -size / 2); }
    ctx.scale(k, k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(path); }
    ctx.strokeStyle = o.stroke || o.color || ink();
    ctx.lineWidth = (o.width || 2.2);
    const draw = o.draw === undefined ? 1 : clamp(o.draw, 0, 1);
    if (draw < 1) { ctx.setLineDash([120 * draw, 120]); }
    if (draw > 0) ctx.stroke(path);
    ctx.restore();
  };

  // A picture handed in with the video (a stock photo, a generated image, the user's logo). fit: cover|contain.
  s.image = (key, x, y, w, h, o = {}) => {
    const img = IMAGES.get(key);
    if (!img) { onMissing?.('image', key); s.rect(x - w / 2, y - h / 2, w, h, { fill: s.c.gray, alpha: 0.25, r: o.radius || 12 }); return; }
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const scale = (o.fit === 'contain' ? Math.min : Math.max)(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    ctx.translate(x, y);
    if (o.rotate) ctx.rotate(o.rotate);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, o.radius ?? 12); else ctx.rect(-w / 2, -h / 2, w, h);
    ctx.clip();
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    if (o.frame !== false) s.rect(x - w / 2, y - h / 2, w, h, { r: o.radius ?? 12, width: o.frameWidth || 4, stroke: o.frameColor || ink(), wobble: 0.6 });
  };

  // A Lottie animation handed in with the video (e.g. an animated Noto emoji). `start` is when it begins playing;
  // `speed` 1 is its own pace; `loop` repeats it.
  s.lottie = (key, x, y, size = 200, o = {}) => {
    const item = LOTTIES.get(key);
    if (!item) { onMissing?.('lottie', key); return; }
    const local = Math.max(0, s.t - (o.start || 0)) * (o.speed || 1) * item.fps;
    const frame = o.loop === false ? Math.min(item.frames - 1, local) : local % item.frames;
    item.anim.goToAndStop(frame, true);
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    const ratio = item.canvas.height / item.canvas.width;
    ctx.drawImage(item.canvas, x - size / 2, y - (size * ratio) / 2, size, size * ratio);
    ctx.restore();
  };

  // A map of the world or a region (Natural Earth, public domain). Returns { at(lon, lat) → [x, y] } to place
  // things on it. o: region name or [lonW, latN, lonE, latS], x, y, w, h (the box), land, sea, highlight
  // ({ ISO2: colour }), draw 0..1 (outlines drawn in), labels [{ at: ISO2 | [lon, lat], text }],
  // route [[lon, lat], ...] with routeDraw 0..1 (an arrow drawn along it), dots [{ at, r, color }].
  s.map = (o = {}) => {
    const [w0, n0, e0, s0] = Array.isArray(o.region) ? o.region : REGIONS[o.region] || REGIONS.world;
    const bx = o.x ?? s.art[0], by = o.y ?? s.art[1] + 40, bw = o.w ?? s.art[2] - s.art[0], bh = o.h ?? s.art[3] - s.art[1] - 80;
    const kx = bw / (e0 - w0), ky = bh / (n0 - s0);
    const k = Math.min(kx, ky);
    const ox = bx + (bw - (e0 - w0) * k) / 2, oy = by + (bh - (n0 - s0) * k) / 2;
    const at = (lon, lat) => [ox + (lon - w0) * k, oy + (n0 - lat) * k];
    const where = (place) => (Array.isArray(place) ? at(place[0], place[1]) : centre(place));
    const centre = (iso) => {
      const rings = WORLD?.[iso]?.rings;
      if (!rings?.length) return at((w0 + e0) / 2, (n0 + s0) / 2);
      const biggest = rings.reduce((a, b) => (b.length > a.length ? b : a));
      const [sx, sy] = biggest.reduce(([ax, ay], [lx, ly]) => [ax + lx, ay + ly], [0, 0]);
      return at(sx / biggest.length, sy / biggest.length);
    };
    if (!WORLD) { onMissing?.('map', 'world'); return { at }; }
    if (o.sea) s.rect(bx, by, bw, bh, { fill: o.sea, stroke: 'none', hatch: false });
    const draw = o.draw === undefined ? 1 : clamp(o.draw, 0, 1);
    // the land is a still picture: drawn once into a cached canvas, faded in with `draw`
    const key = JSON.stringify([w0, n0, e0, s0, bx, by, bw, bh, o.land, o.highlight, o.border, o.borderWidth, ink()]);
    let layer = MAPS.get(key);
    if (layer === undefined) {
      layer = makeCanvas(Math.ceil(bw * 2), Math.ceil(bh * 2));
      if (layer) {
        const g = layer.getContext('2d');
        g.scale(2, 2);
        g.translate(-bx, -by);
        g.lineJoin = 'round';
        for (const [iso, country] of Object.entries(WORLD)) {
          for (const ring of country.rings) {
            if (ring.every(([lon]) => lon < w0 - 5) || ring.every(([lon]) => lon > e0 + 5) || ring.every(([, lat]) => lat > n0 + 5) || ring.every(([, lat]) => lat < s0 - 5)) continue;
            g.beginPath();
            ring.forEach(([lon, lat], i) => { const [px, py] = at(lon, lat); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
            g.closePath();
            g.fillStyle = o.highlight?.[iso] || o.land || '#e9dfc6';
            g.fill();
            g.strokeStyle = o.border || ink();
            g.lineWidth = o.borderWidth ?? 1.4;
            g.stroke();
          }
        }
      }
      if (MAPS.size > 20) MAPS.delete(MAPS.keys().next().value);
      MAPS.set(key, layer || null);
    }
    if (layer) {
      ctx.save();
      ctx.globalAlpha *= draw;
      ctx.drawImage(layer, bx, by, bw, bh);
      ctx.restore();
    }
    for (const dot of o.dots || []) { const [px, py] = where(dot.at); s.circle(px, py, dot.r || 8, { fill: dot.color || s.c.red, width: 2, hatch: false }); }
    if (o.route?.length > 1) {
      const pts = o.route.map((p) => where(p));
      const rd = o.routeDraw === undefined ? 1 : clamp(o.routeDraw, 0, 1);
      s.curve(pts, { stroke: o.routeColor || s.c.red, width: o.routeWidth || 5, draw: rd, pen: true });
    }
    for (const label of o.labels || []) {
      const [px, py] = where(label.at);
      s.text(label.text, px + (label.dx || 0), py + (label.dy || 0), { size: label.size || 24, color: label.color || ink() });
    }
    return { at, where };
  };

  // Charts: type bar|line|pie, data [{ label, value, color }], draw 0..1 grows them in.
  s.chart = (o = {}) => {
    const data = (o.data || []).filter((d) => Number.isFinite(Number(d.value)));
    if (!data.length) return;
    const x = o.x ?? 80, y = o.y ?? 220, w = o.w ?? 560, h = o.h ?? 420;
    const draw = o.draw === undefined ? 1 : clamp(o.draw, 0, 1);
    const colors = [s.c.orange, s.c.blue, s.c.green, s.c.pink, s.c.purple, s.c.teal, s.c.yellow, s.c.red];
    const max = Math.max(...data.map((d) => Number(d.value)), 1e-9);
    if (o.type === 'pie') {
      const total = data.reduce((a, d) => a + Number(d.value), 0) || 1;
      let a0 = -Math.PI / 2;
      const r = Math.min(w, h) / 2;
      data.forEach((d, i) => {
        const a1 = a0 + (Number(d.value) / total) * Math.PI * 2 * draw;
        const pts = [[x + w / 2, y + h / 2]];
        for (let k = 0; k <= 24; k += 1) { const a = a0 + (a1 - a0) * k / 24; pts.push([x + w / 2 + Math.cos(a) * r, y + h / 2 + Math.sin(a) * r]); }
        s.shape(pts, { fill: d.color || colors[i % colors.length] });
        if (draw > 0.9 && d.label) { const m = (a0 + a1) / 2; s.text(d.label, x + w / 2 + Math.cos(m) * r * 0.62, y + h / 2 + Math.sin(m) * r * 0.62, { size: 22, color: '#2b2622' }); }
        a0 = a1;
      });
      return;
    }
    const base = y + h;
    s.line(x, base, x + w, base, { width: 3 });
    if (o.type === 'line') {
      const pts = data.map((d, i) => [x + (i + 0.5) * w / data.length, base - (Number(d.value) / max) * h * 0.9]);
      s.polyline(pts, { stroke: o.color || s.c.orange, width: 6, draw, pen: true });
      pts.forEach(([px, py], i) => { if (draw * data.length > i) s.circle(px, py, 8, { fill: o.color || s.c.orange, hatch: false }); });
    } else {
      const bw = (w / data.length) * 0.62;
      data.forEach((d, i) => {
        const grow = clamp(draw * data.length - i, 0, 1);
        const bh = (Number(d.value) / max) * h * 0.9 * s.ease.out(grow);
        const bx = x + (i + 0.5) * w / data.length - bw / 2;
        if (bh > 1) s.rect(bx, base - bh, bw, bh, { fill: d.color || colors[i % colors.length], r: 6 });
        if (d.label) s.text(d.label, bx + bw / 2, base + 26, { size: 22 });
        if (grow >= 1 && o.values !== false) s.text(o.format ? o.format(d.value) : String(d.value), bx + bw / 2, base - bh - 22, { size: 24 });
      });
    }
  };

  // A number counting up from `from` to `to` between `start` and start + `len` seconds.
  s.counter = (from, to, x, y, o = {}) => {
    const k = s.at(o.start ?? 0, o.len ?? 1.2);
    const value = from + (to - from) * k;
    const digits = o.decimals ?? (Number.isInteger(from) && Number.isInteger(to) ? 0 : 1);
    const text = value.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    s.text(`${o.prefix || ''}${text}${o.suffix || ''}`, x, y, { size: o.size || 96, color: o.color || ink(), align: o.align });
  };

  // A chat bubble: side 'left' (them) or 'right' (me); `draw` pops it in.
  s.bubble = (text, x, y, o = {}) => {
    const size = o.size || 28, w = o.w || 420;
    const lines = wrap(String(text), w - 40, size);
    const h = lines.length * size * 1.25 + 28;
    const k = o.draw === undefined ? 1 : s.ease.back(clamp(o.draw, 0, 1));
    if (k <= 0) return;
    const right = o.side === 'right';
    s.group({ x, y, scale: k }, () => {
      const left = right ? -w : 0;
      s.rect(left, -h / 2, w, h, { fill: o.fill || (right ? '#dcf8c6' : s.c.white), r: 22 });
      s.shape(right ? [[-18, h / 2 - 22], [10, h / 2 + 6], [-34, h / 2 - 4]] : [[18, h / 2 - 22], [-10, h / 2 + 6], [34, h / 2 - 4]], { fill: o.fill || (right ? '#dcf8c6' : s.c.white), hatch: false });
      lines.forEach((line, i) => s.text(line, left + 20, -h / 2 + 14 + size * 0.62 + i * size * 1.25, { size, align: 'left', color: o.color || '#2b2622' }));
    });
  };

  // A call-to-action button, gently pulsing when `pulse` is on.
  s.button = (text, x, y, o = {}) => {
    const size = o.size || 34;
    const w = o.w || Math.max(180, measure(String(text), size) + size * 1.6), h = size * 1.9;
    const pulse = o.pulse === false ? 0 : 0.04 * (0.5 + 0.5 * Math.sin(s.t * Math.PI * 2 * 1.5));
    s.group({ x, y, scale: (o.scale ?? 1) * (1 + pulse) }, () => {
      s.rect(-w / 2, -h / 2 + 6, w, h, { fill: 'rgba(0,0,0,0.25)', stroke: 'none', r: h / 2, hatch: false });
      s.rect(-w / 2, -h / 2, w, h, { fill: o.fill || s.c.red, r: h / 2 });
      s.text(text, 0, 0, { size, color: o.color || s.c.white });
    });
  };

  // A price tag: the old price struck through, the new one dropping in at `start`.
  s.price = (was, now, x, y, o = {}) => {
    const money = (v) => (typeof v === 'number' ? `${o.currency ?? 'Rp'}${v.toLocaleString('id-ID')}` : String(v));
    const k = s.at(o.start ?? 0.3, 0.4);
    if (was !== null && was !== undefined) {
      s.text(money(was), x, y - 60, { size: (o.size || 80) * 0.5, color: s.c.gray });
      s.line(x - 110, y - 58, x - 110 + 220 * s.at((o.start ?? 0.3) - 0.2, 0.3), y - 62, { stroke: s.c.red, width: 6 });
    }
    s.group({ x, y: y - (1 - k) * 60, alpha: k }, () => s.text(money(now), 0, 0, { size: o.size || 80, color: o.color || s.c.red }));
  };

  s.progress = (x, y, w, value, o = {}) => {
    const h = o.h || 34;
    s.rect(x, y, w, h, { fill: o.track || '#e7e1d3', r: h / 2, hatch: false });
    const v = clamp(value, 0, 1);
    if (v > 0.01) s.rect(x, y, w * v, h, { fill: o.fill || s.c.green, r: h / 2 });
    if (o.label) s.text(o.label, x + w / 2, y + h / 2, { size: h * 0.7, color: '#2b2622' });
  };

  // A timeline of steps or dates: items [{ label, text }], drawn in left to right with `draw`.
  s.timeline = (items, x, y, w, o = {}) => {
    const list = items || [];
    if (!list.length) return;
    const draw = o.draw === undefined ? 1 : clamp(o.draw, 0, 1);
    s.line(x, y, x + w * draw, y, { width: 5 });
    list.forEach((item, i) => {
      const px = x + (list.length === 1 ? w / 2 : (i * w) / (list.length - 1));
      if (draw * (list.length - 1 || 1) + 1e-6 < i) return;
      s.circle(px, y, 14, { fill: o.color || s.c.orange });
      if (item.label) s.text(item.label, px, y - 42, { size: 26 });
      if (item.text) s.text(item.text, px, y + 46, { size: 20, color: s.c.gray });
    });
  };

  function measure(text, size) {
    ctx.save();
    ctx.font = `${size}px MotionHand, "Patrick Hand", cursive`;
    const w = ctx.measureText(text).width;
    ctx.restore();
    return w;
  }
  function wrap(text, width, size) {
    const words = text.split(/\s+/);
    const lines = [''];
    for (const word of words) {
      const next = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${word}` : word;
      if (measure(next, size) > width && lines[lines.length - 1]) lines.push(word); else lines[lines.length - 1] = next;
    }
    return lines;
  }
  return s;
}
