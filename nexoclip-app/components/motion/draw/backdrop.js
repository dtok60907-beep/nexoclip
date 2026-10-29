// Backgrounds of a drawn scene: a gradient per theme with a light pattern on top. "paper" lays the picture on a
// cream sheet above a coloured caption band; "dusk" and "night" fill the frame and darken the caption band.
// Drawn in the canvas units of the video's format (layout.js).

import { hash } from './sketch.js';
import { makeCanvas } from './canvasFactory.js';

export const THEMES = ['paper', 'dusk', 'night'];
export const PATTERNS = ['none', 'dots', 'grid', 'bigGrid', 'lines', 'stars', 'halftone', 'grain', 'chalk', 'wash', 'horizon',
  'sunburst', 'mist', 'hud', 'stripes', 'dotsup', 'neonwave', 'slash', 'hills', 'peaks', 'house', 'dither', 'washi', 'plate',
  'sunset', 'film', 'room', 'deepgrid', 'shore', 'craft', 'softgrid', 'ridge'];

export const DEFAULT_BACKGROUND = {
  paper: { top: '#fff1d6', bottom: '#ffd9a0', pattern: 'craft' },
  dusk: { top: '#ff8a5b', bottom: '#6b3fa0', pattern: 'sunset' },
  night: { top: '#1b2a4a', bottom: '#0b1226', pattern: 'stars' },
};


import { layoutOf } from './layout.js';

// The frame being drawn (set per call from the format): its size, where the caption band and the sheet end.
let W = 720, H = 1280, CAPTION_TOP = 870, SHEET_BOTTOM = 905;
const useFormat = (format) => { const L = layoutOf(format); W = L.w; H = L.h; CAPTION_TOP = L.captionTop; SHEET_BOTTOM = L.sheetBottom; };
const HEX = /^#[0-9a-f]{6}$/i;

// A scene's background: one of the video's named looks (paper, dusk, night or any name the AI made up), with
// sensible defaults. `sheet` lays the picture on a paper sheet above the caption band; `dark` decides the ink and
// caption colours; `image` is a picture key (extras.js) used as the backdrop.
export function themeBackground(background, theme) {
  const given = background?.[theme] || {};
  const fallback = DEFAULT_BACKGROUND[theme] || DEFAULT_BACKGROUND.paper;
  const top = HEX.test(given.top) ? given.top : fallback.top;
  const bottom = HEX.test(given.bottom) ? given.bottom : fallback.bottom;
  return {
    top, bottom,
    pattern: PATTERNS.includes(given.pattern) ? given.pattern : (given.top ? 'none' : fallback.pattern),
    sheet: typeof given.sheet === 'boolean' ? given.sheet : theme === 'paper',
    dark: luminance(top) < 0.5,
    image: typeof given.image === 'string' ? given.image : '',
  };
}

function luminance(hex) {
  if (!HEX.test(hex)) return 1;
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function pattern(ctx, name, { t, light, y0 = 0, y1 = H }) {
  const ink = light ? 'rgba(60,40,20,' : 'rgba(255,255,255,';
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y0, W, y1 - y0);
  ctx.clip();
  const line = (alpha, width = 1.5) => { ctx.strokeStyle = `${ink}${alpha})`; ctx.lineWidth = width; };
  const fill = (alpha) => { ctx.fillStyle = `${ink}${alpha})`; };
  switch (name) {
    case 'dots': case 'dotsup': case 'halftone': case 'dither': {
      const gap = name === 'dither' ? 14 : 34;
      for (let y = y0 + gap / 2, r = 0; y < y1; y += gap, r += 1) {
        for (let x = (r % 2) * gap / 2; x < W; x += gap) {
          const size = name === 'halftone' ? 1 + 3 * (y - y0) / (y1 - y0) : name === 'dotsup' ? 1 + 3 * (1 - (y - y0) / (y1 - y0)) : 2;
          fill(name === 'dither' ? 0.05 : 0.1);
          ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
        }
      }
      break;
    }
    case 'grid': case 'bigGrid': case 'softgrid': case 'deepgrid': case 'hud': {
      const gap = name === 'bigGrid' ? 90 : name === 'deepgrid' ? 60 : 40;
      line(name === 'softgrid' ? 0.05 : 0.09);
      ctx.beginPath();
      for (let x = 0; x <= W; x += gap) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
      for (let y = y0; y <= y1; y += gap) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      break;
    }
    case 'lines': case 'stripes': case 'film': case 'plate': {
      line(0.08, name === 'stripes' ? 10 : 1.5);
      ctx.beginPath();
      for (let y = y0 + 20; y < y1; y += name === 'stripes' ? 44 : 30) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      break;
    }
    case 'slash': case 'washi': {
      line(0.07, name === 'washi' ? 14 : 2);
      ctx.beginPath();
      for (let x = -H; x < W; x += 46) { ctx.moveTo(x, y1); ctx.lineTo(x + (y1 - y0), y0); }
      ctx.stroke();
      break;
    }
    case 'stars': {
      for (let i = 0; i < 70; i += 1) {
        const x = hash(i * 3 + 1) * W, y = y0 + hash(i * 3 + 2) * (y1 - y0);
        const a = 0.25 + 0.5 * hash(i * 3 + 4);
        fill(a * 0.6);
        ctx.beginPath(); ctx.arc(x, y, 0.8 + hash(i * 3 + 3) * 1.6, 0, Math.PI * 2); ctx.fill();
      }
      // a soft light from the top left
      const g = ctx.createRadialGradient(80, 60, 0, 80, 60, 520);
      g.addColorStop(0, 'rgba(255,255,255,0.10)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'grain': case 'chalk': case 'craft': case 'mist': case 'wash': {
      const n = name === 'grain' ? 900 : 420;
      for (let i = 0; i < n; i += 1) {
        const x = hash(i * 5 + 11) * W, y = y0 + hash(i * 5 + 12) * (y1 - y0);
        fill(name === 'mist' ? 0.03 : 0.06);
        if (name === 'chalk' || name === 'craft') ctx.fillRect(x, y, 6 + hash(i) * 14, 1.2);
        else { ctx.beginPath(); ctx.arc(x, y, name === 'mist' ? 30 : 1.2, 0, Math.PI * 2); ctx.fill(); }
      }
      break;
    }
    case 'sunset': case 'sunburst': case 'horizon': case 'neonwave': {
      const cy = CAPTION_TOP;
      ctx.fillStyle = 'rgba(214,190,255,0.55)';
      ctx.beginPath(); ctx.arc(W / 2, cy, 150, Math.PI, 0); ctx.fill();
      line(0.12, 2);
      ctx.beginPath();
      for (let k = 1; k < 7; k += 1) { const y = cy - k * k * 9; ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      if (name === 'sunburst') {
        line(0.07, 3);
        ctx.beginPath();
        for (let i = 0; i < 18; i += 1) { const a = Math.PI + i / 17 * Math.PI; ctx.moveTo(W / 2, cy); ctx.lineTo(W / 2 + Math.cos(a) * 900, cy + Math.sin(a) * 900); }
        ctx.stroke();
      }
      break;
    }
    case 'hills': case 'peaks': case 'ridge': case 'shore': case 'house': case 'room': {
      fill(0.08);
      ctx.beginPath();
      ctx.moveTo(0, CAPTION_TOP);
      for (let x = 0; x <= W; x += 20) {
        const y = name === 'peaks' || name === 'ridge'
          ? CAPTION_TOP - 120 - Math.abs(((x / 160) % 2) - 1) * 120
          : CAPTION_TOP - 90 - Math.sin(x / 120) * 40;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, CAPTION_TOP);
      ctx.fill();
      break;
    }
    default: break;
  }
  ctx.restore();
}

// The whole frame behind the picture.
// Backgrounds are still pictures, so each one is drawn once into a cached canvas and stamped every frame.
const CACHE = new Map();
const SCALE = 1.5; // cached at 1080 x 1920

export function drawBackdrop(ctx, options) {
  const { theme = 'paper', background, chalk = false, drawImage = null, format } = options;
  useFormat(format);
  const bg = themeBackground(background, theme);
  if (!(bg.image && drawImage)) {
    const key = JSON.stringify([theme, chalk, bg, format]);
    let cached = CACHE.get(key);
    if (cached === undefined) {
      const canvas = makeCanvas(W * SCALE, H * SCALE);
      if (canvas) {
        const g = canvas.getContext('2d');
        g.scale(SCALE, SCALE);
        paintBackdrop(g, options);
      }
      cached = canvas || null;
      if (CACHE.size > 40) CACHE.delete(CACHE.keys().next().value);
      CACHE.set(key, cached);
    }
    if (cached) { ctx.drawImage(cached, 0, 0, W, H); return; }
  }
  paintBackdrop(ctx, options);
}

// `chalk` draws a chalkboard whatever the colours asked for (the chalk style).
function paintBackdrop(ctx, { theme = 'paper', background, t = 0, chalk = false, drawImage = null }) {
  const bg = chalk ? { top: '#33423c', bottom: '#1e2925', pattern: 'chalk', sheet: false, dark: true, image: '' } : themeBackground(background, theme);
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, bg.top);
  gradient.addColorStop(1, bg.bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
  const light = luminance(bg.top) > 0.55;
  if (bg.image && drawImage) drawImage(bg.image);
  if (bg.sheet) {
    pattern(ctx, bg.pattern, { t, light: true, y0: SHEET_BOTTOM, y1: H });
    // the sheet, with a soft shadow and a teal scrap peeking from under it
    ctx.save();
    ctx.fillStyle = '#4fb3a9';
    ctx.beginPath(); ctx.moveTo(W - 160, SHEET_BOTTOM - 10); ctx.lineTo(W - 12, SHEET_BOTTOM - 20); ctx.lineTo(W - 30, SHEET_BOTTOM + 34); ctx.closePath(); ctx.fill();
    ctx.shadowColor = 'rgba(80,50,20,0.22)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#fbf7ee';
    ctx.fillRect(0, 0, W, SHEET_BOTTOM);
    ctx.restore();
    pattern(ctx, 'grain', { t, light: true, y0: 0, y1: SHEET_BOTTOM });
    return;
  }
  pattern(ctx, bg.pattern, { t, light });
  // darken the caption band so white captions read
  const band = ctx.createLinearGradient(0, CAPTION_TOP, 0, H);
  // a light picture area gets a dark band; a dark one a lighter wash, so white captions always read
  band.addColorStop(0, bg.dark ? 'rgba(5,8,20,0.35)' : 'rgba(20,10,30,0.92)');
  band.addColorStop(1, bg.dark ? 'rgba(5,8,20,0.55)' : 'rgba(10,5,15,0.98)');
  ctx.fillStyle = band;
  ctx.fillRect(0, CAPTION_TOP, W, H - CAPTION_TOP);
}
