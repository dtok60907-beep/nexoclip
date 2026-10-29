// Snapshots of a drawn scene on the server (@napi-rs/canvas), for the AI to look at: the same paint code as the
// player (components/motion/draw/paint.js), with the scene's drawing code run in a vm with a time limit.
// Pictures and Lottie animations are not loaded here; they show as their placeholders.
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts, Path2D } from '@napi-rs/canvas';
import { paintScene, drawTimeline } from '../../components/motion/draw/paint.js';
import { layoutOf } from '../../components/motion/draw/layout.js';
import { useExtrasData } from '../../components/motion/draw/extras.js';
import { castInContext } from './motionStory.js';
import { FONT_FILES, codeKey } from '../../components/motion/draw/sketch.js';

const require = createRequire(import.meta.url);
if (!globalThis.Path2D) globalThis.Path2D = Path2D; // s.icon strokes Lucide paths
globalThis.__motionCanvas = (w, h) => createCanvas(w, h); // cached tiles and backgrounds (sketch.js makeCanvas)
useExtrasData({ icons: require('../../components/motion/draw/lucideIcons.json'), world: require('../../components/motion/draw/worldMap.json') });
let fontReady = false;

function ensureFont() {
  if (fontReady) return;
  for (const [family, file] of Object.entries(FONT_FILES)) GlobalFonts.registerFromPath(fileURLToPath(new URL(`../../public/motion-fonts/${file}`, import.meta.url)), family);
  fontReady = true;
}

// PNG buffers of scene `index` at the given fractions of its length (default start, middle, end).
export function sceneFrames(story, index, { at = [0.08, 0.5, 0.92], width = 540 } = {}) {
  ensureFont();
  const timeline = drawTimeline(story.scenes);
  const scene = timeline[index];
  if (!scene) throw Object.assign(new Error('Adegan tidak ada.'), { status: 400 });
  const script = new vm.Script(`(function (s, ctx) {\n${scene.code || ''}\n})(__s, __ctx);`);
  const context = vm.createContext({ Math, Number, String, Array, Object, JSON, Infinity, NaN, isFinite, parseFloat, parseInt });
  const cast = story.canvas === 2 ? castInContext(context, story.cast) : null;
  const run = (s, ctx) => {
    context.__s = s;
    context.__ctx = ctx;
    script.runInContext(context, { timeout: 500 });
  };
  const L = layoutOf(story.format);
  const height = Math.round(width * L.h / L.w);
  return at.map((fraction) => {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.scale(width / L.w, height / L.h);
    const t = Math.max(0, Math.min(scene.dur - 0.01, scene.dur * fraction));
    paintScene(ctx, { scene, run: scene.code ? run : null, t, background: story.background, seed: index + 1, pace: story.paceSpec || story.pace, style: story.styleSpec || story.style, format: story.format,
      canvas: story.canvas, palette: story.palette, caption: story.caption, cast, stillKey: `frames:${codeKey(scene.code)}` });
    return { t: Math.round(t * 10) / 10, png: canvas.toBuffer('image/png') };
  });
}
