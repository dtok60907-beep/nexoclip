import test from 'node:test';
import assert from 'node:assert/strict';
import { compileScene, createSketch, hash, splitScenes } from './sketch.js';

// A context that records the calls a scene makes, enough to run the kit outside a browser.
function recorder() {
  const calls = [];
  const gradient = { addColorStop() {} };
  return new Proxy({ calls, globalAlpha: 1 }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => gradient;
      if (key === 'measureText') return (text) => ({ width: String(text).length * 10 });
      return (...args) => { calls.push(key); return undefined; };
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}

test('one answer with scene markers splits into the code of each scene', () => {
  const scenes = splitScenes('```js\n// ===== SCENE 5 =====\ns.ground();\n\n// ===== SCENE 6 =====\ns.circle(1, 2, 3);\n```');
  assert.deepEqual(scenes, { 5: 's.ground();', 6: 's.circle(1, 2, 3);' });
});

test('easing helpers follow the drawing contract', () => {
  const s = createSketch({ ctx: recorder(), t: 1, dur: 2 });
  assert.equal(s.p, 0.5);
  assert.equal(s.at(2), 0);
  assert.equal(s.at(0, 0.5), 1);
  assert.equal(s.pop(1.5), 0);
  assert.ok(s.pop(0.75, 0.5) > 1, 'pop overshoots before it settles');
  assert.equal(s.pop(0, 0.5), 1);
  assert.equal(s.rand(3), s.rand(3));
  assert.notEqual(s.rand(3), s.rand(4));
  assert.ok(hash(1) >= 0 && hash(1) < 1);
});

test('a frame of scene code draws, and its sound cues are collected', () => {
  const cues = [];
  const ctx = recorder();
  const run = compileScene('s.ground(); s.group({ x: 10, scale: s.pop(0) }, () => s.rect(0, 0, 50, 40, { fill: s.c.orange, r: 6 })); s.burst(0, 0, 40, { draw: 0.5 }); s.sfx("thud", 0.4, 0.8, 0.5);');
  run(createSketch({ ctx, t: 0.5, dur: 2, onSfx: (cue) => cues.push(cue) }), ctx);
  assert.ok(ctx.calls.includes('stroke') && ctx.calls.includes('fill'));
  assert.deepEqual(cues, [{ name: 'thud', time: 0.4, gain: 0.8, pitch: 0.5 }]);
});

test('ink is light on the night theme so outlines stay visible', () => {
  assert.notEqual(createSketch({ ctx: recorder(), t: 0, dur: 1, theme: 'night' }).c.ink, createSketch({ ctx: recorder(), t: 0, dur: 1 }).c.ink);
});
