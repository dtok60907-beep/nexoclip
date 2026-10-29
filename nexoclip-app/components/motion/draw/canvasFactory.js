// An offscreen canvas for cached tiles, backgrounds and map layers: the browser's, or one the server registers
// (globalThis.__motionCanvas, see src/services/motionFrames.js). null where there is none (the code check).
export function makeCanvas(w, h) {
  if (typeof globalThis.__motionCanvas === 'function') return globalThis.__motionCanvas(w, h);
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return null;
}
