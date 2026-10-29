// The drawing of a drawn video, without React: the scene timeline, word timings, the camera, the typewriter
// caption and paintScene() (one frame into a 2D context). Shared by the player (DrawVideo.js) and the server,
// which draws snapshots of a scene for the AI to look at (src/services/motionFrames.js).

import { createSketch } from './sketch.js';
import { drawBackdrop, themeBackground } from './backdrop.js';
import { layoutOf } from './layout.js';
import { drawStyleOf, paceOf } from './story.js';

export const FONT_FAMILY = 'MotionHand';
export const DRAW_FPS = 30;
export const CAMERAS = ['push', 'pull', 'pan-left', 'pan-right', 'tilt-up', 'tilt-down', 'roll', 'orbit', 'crash', 'handheld', 'shake'];

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const easeOut = (x) => 1 - (1 - x) ** 3;
const easeInOut = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);

export function drawTimeline(scenes, fps = DRAW_FPS) {
  let start = 0;
  return (scenes || []).map((scene) => {
    const dur = clamp(Number(scene.duration) || 3, 0.8, 15);
    const from = Math.round(start * fps);
    start += dur;
    return { ...scene, dur, from, frames: Math.round(start * fps) - from };
  });
}

export const drawFrames = (scenes, fps = DRAW_FPS) => {
  const timeline = drawTimeline(scenes, fps);
  const last = timeline[timeline.length - 1];
  return last ? last.from + last.frames : fps;
};

const bare = (word) => String(word || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// When each word is spoken (seconds into the scene): the voiceover's timings, or an even read of the text.
export function sceneWords(scene, dur) {
  if (Array.isArray(scene.words) && scene.words.length) return scene.words.map((w) => ({ w: String(w.w), s: Number(w.s) || 0 }));
  const words = String(scene.text || '').split(/\s+/).filter(Boolean);
  const weight = words.map((w) => w.length + 2);
  const total = weight.reduce((a, b) => a + b, 0) || 1;
  let at = 0.15;
  return words.map((w, i) => {
    const word = { w, s: at };
    at += (dur * 0.78) * weight[i] / total;
    return word;
  });
}

// The moment the camera hits: when the emphasis word is spoken.
function hitTime(words, emphasis, dur) {
  const target = bare(emphasis);
  const found = target && words.find((w) => bare(w.w) === target);
  return found ? found.s : dur * 0.6;
}

const smoothNoise = (t, k) => Math.sin(t * 1.7 + k) * 0.6 + Math.sin(t * 3.1 + k * 2.3) * 0.3 + Math.sin(t * 5.3 + k * 4.1) * 0.1;

// Camera over the picture (not the caption): { x, y, scale, rotate } around the picture's centre. `force` scales
// every move (the pace: calm videos move less, hype ones more).
export function cameraAt(name, t, dur, hit, force = 1) {
  const cam = baseCamera(name, t, dur, hit);
  return { x: cam.x * force, y: cam.y * force, scale: 1 + (cam.scale - 1) * force, rotate: cam.rotate * force };
}

function baseCamera(name, t, dur, hit) {
  const p = clamp(t / dur, 0, 1);
  const since = t - hit;
  const spike = since >= 0 ? Math.exp(-since * 7) * (1 - Math.exp(-since * 40)) : 0;
  const cam = { x: 0, y: 0, scale: 1 + 0.035 * spike, rotate: 0 };
  switch (name) {
    case 'push': cam.scale += 0.08 * easeInOut(p); break;
    case 'pull': cam.scale += 0.12 * (1 - easeOut(p)); break;
    case 'pan-left': cam.x = -40 + 80 * easeInOut(p); cam.scale += 0.04; break;
    case 'pan-right': cam.x = 40 - 80 * easeInOut(p); cam.scale += 0.04; break;
    case 'tilt-up': cam.y = -40 + 80 * easeInOut(p); cam.scale += 0.04; break;
    case 'tilt-down': cam.y = 40 - 80 * easeInOut(p); cam.scale += 0.04; break;
    case 'roll': cam.rotate = -0.06 * easeInOut(p) + 0.015 * Math.sin(t * 2); cam.scale += 0.05; break;
    case 'orbit': cam.rotate = 0.035 * Math.sin(t * 2.2); cam.x = 18 * Math.sin(t * 2.2); cam.scale += 0.03; break;
    case 'crash': cam.scale += since >= 0 ? 0.16 * Math.exp(-since * 5) + 0.05 : 0; break;
    case 'handheld': cam.x = 6 * smoothNoise(t, 1); cam.y = 5 * smoothNoise(t, 2); cam.rotate = 0.006 * smoothNoise(t, 3); cam.scale += 0.02; break;
    case 'shake': {
      const a = since >= 0 ? 14 * Math.exp(-since * 6) : 1.5;
      cam.x = a * Math.sin(t * 61); cam.y = a * Math.sin(t * 47 + 1); cam.rotate = 0.01 * a / 14 * Math.sin(t * 53);
      break;
    }
    default: cam.scale += 0.04 * p;
  }
  return cam;
}

// Typewriter caption: the full text is laid out first, then each word types in where it will sit.
function drawCaption(ctx, { text, emphasis, sheet, words, t, format }) {
  const L = layoutOf(format);
  const { size, line: lineHeight, width: maxWidth } = L.caption;
  const accent = sheet ? '#e8641c' : '#ff9d4d';
  const base = sheet ? '#2b2622' : '#ffffff';
  ctx.save();
  ctx.font = `${size}px ${FONT_FAMILY}, "Patrick Hand", cursive`;
  ctx.textBaseline = 'middle';
  const space = ctx.measureText(' ').width;
  const lines = [[]];
  let width = 0;
  for (const word of words) {
    const w = ctx.measureText(word.w).width;
    if (width && width + space + w > maxWidth) { lines.push([]); width = 0; }
    width += (width ? space : 0) + w;
    lines[lines.length - 1].push({ ...word, width: w });
  }
  const band = L.h - (sheet ? L.sheetBottom : L.captionTop);
  const top = (sheet ? L.sheetBottom : L.captionTop) + band * 0.42 - (lines.length - 1) * lineHeight / 2;
  const target = bare(emphasis);
  const flat = lines.flat();
  lines.forEach((line, row) => {
    const lineWidth = line.reduce((sum, w, i) => sum + w.width + (i ? space : 0), 0);
    let x = L.w / 2 - lineWidth / 2;
    const y = top + row * lineHeight;
    for (const word of line) {
      const index = flat.indexOf(word);
      const next = flat[index + 1];
      const typeFor = clamp((next ? next.s : word.s + 0.3) - word.s, 0.08, 0.35);
      const typed = clamp((t - word.s) / typeFor, 0, 1);
      if (typed > 0) {
        const chars = Math.ceil(word.w.length * typed);
        const strong = target && bare(word.w) === target;
        ctx.fillStyle = strong ? accent : base;
        ctx.globalAlpha = clamp((t - word.s) / 0.08, 0, 1);
        ctx.fillText(word.w.slice(0, chars), x, y + 6 * (1 - easeOut(clamp((t - word.s) / 0.15, 0, 1))));
        if (strong && typed >= 1) {
          const u = easeOut(clamp((t - word.s - typeFor) / 0.3, 0, 1));
          ctx.strokeStyle = accent;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.beginPath();
          for (let k = 0; k <= 24 * u; k += 1) {
            const px = x + word.width * k / 24, py = y + size * 0.52 + Math.sin(k / 24 * Math.PI * 4) * 3;
            if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          }
          ctx.stroke();
          if (u >= 1) {
            const a = clamp(1 - (t - word.s - typeFor - 0.3) / 0.6, 0, 1);
            ctx.globalAlpha = a;
            ctx.fillStyle = '#f7c948';
            const sx = x + word.width + 6, sy = y - size * 0.45, r = 9;
            ctx.beginPath();
            for (let k = 0; k < 8; k += 1) {
              const ang = k * Math.PI / 4 - Math.PI / 2, rr = k % 2 ? r * 0.35 : r;
              ctx.lineTo(sx + Math.cos(ang) * rr, sy + Math.sin(ang) * rr);
            }
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      }
      x += word.width + space;
    }
  });
  ctx.restore();
}

// Draws one frame of a scene into a 2D context already scaled to the format's canvas units (layout.js).
export function paintScene(ctx, { scene, run, t, background, seed, pace = 'normal', style = 'krayon', format = '9:16' }) {
  const L = layoutOf(format);
  const dur = scene.dur || Number(scene.duration) || 3;
  const look = drawStyleOf(style);
  const theme = look.themes?.length && !look.themes.includes(scene.theme) ? look.themes[0]
    : scene.theme && (background?.[scene.theme] || ['paper', 'dusk', 'night'].includes(scene.theme)) ? scene.theme : 'paper';
  const bg = look.sketch.chalk ? { sheet: false, dark: true } : themeBackground(background, theme);
  const words = sceneWords(scene, dur);
  const time = Math.max(0, t);
  drawBackdrop(ctx, {
    theme, background, t: time, chalk: Boolean(look.sketch.chalk),
    format,
    drawImage: (key) => createSketch({ ctx, t: time, dur, theme, format }).image(key, L.w / 2, L.h / 2, L.w, L.h, { radius: 0, frame: false }),
  });
  const cam = cameraAt(scene.camera, time, dur, hitTime(words, scene.emphasis, dur), paceOf(pace).camera);
  let error = null;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, L.w, bg.sheet ? L.sheetBottom : L.captionTop);
  ctx.clip();
  ctx.translate(L.center[0] + cam.x, L.center[1] + cam.y);
  ctx.rotate(cam.rotate);
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-L.center[0], -L.center[1]);
  if (run) {
    try {
      run(createSketch({ ctx, t: time, dur, theme, seed, format, look: look.sketch, dark: ['paper', 'dusk', 'night'].includes(theme) ? null : bg.dark }), ctx);
    } catch (err) {
      error = err;
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  drawCaption(ctx, { text: scene.text, emphasis: scene.emphasis, sheet: bg.sheet, words, t: time, format });
  return error;
}

// The sound cues a scene's code schedules (s.sfx is called at the top level, so one dry run collects them).
export function collectSfx(run, { dur, theme, seed }) {
  if (!run || typeof document === 'undefined') return [];
  const cues = [];
  const canvas = document.createElement('canvas');
  canvas.width = 8; canvas.height = 8;
  try {
    run(createSketch({ ctx: canvas.getContext('2d'), t: 0, dur, theme, seed, onSfx: (cue) => cues.push(cue) }), canvas.getContext('2d'));
  } catch { /* drawing errors show in the frame itself */ }
  return cues.filter((cue) => cue.time >= 0 && cue.time < dur + 0.5).slice(0, 12);
}

