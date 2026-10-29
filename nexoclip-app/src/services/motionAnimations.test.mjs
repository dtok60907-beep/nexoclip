import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTRANCES, EASINGS, LOOPS, layerMotion, sample } from '../../components/motion/animations.js';
import { layerStarts, parseCount } from '../../components/motion/sceneKinds.js';

test('keyframes interpolate per property and hold their ends', () => {
  assert.deepEqual(sample(ENTRANCES['slide-up'], 0), { o: 0, y: 40 });
  assert.deepEqual(sample(ENTRANCES['slide-up'], 1), { o: 1, y: 0 });
  const mid = sample(ENTRANCES.bounce, 0.3);
  assert.ok(mid.y > -120 && mid.y < 12);
  assert.ok(EASINGS.back(0.5) > 1, 'back overshoots like the CSS curve');
});

test('a layer is hidden before its entrance, loops after it and leaves with its exit', () => {
  assert.equal(layerMotion({ entrance: 'fade', start: 1, sceneSeconds: 5, sec: 0.5 }).o, 0);
  assert.equal(layerMotion({ entrance: 'fade', start: 1, sceneSeconds: 5, sec: 2 }).o, 1);
  const looping = layerMotion({ entrance: 'fade', loop: 'pulse', start: 0, sceneSeconds: 5, sec: 1.4 });
  assert.ok(looping.s > 1 && looping.s <= 1.12 + 1e-9);
  assert.ok(layerMotion({ entrance: 'fade', exit: 'fade-out', start: 0, sceneSeconds: 5, sec: 5 }).o < 1e-6);
  assert.ok(LOOPS.glitch.every > LOOPS.glitch.seconds);
});

test('layers follow each other unless they set their own start', () => {
  const starts = layerStarts([{ entrance: 'fade' }, { entrance: 'fade', at: 2 }, { entrance: 'scale' }]);
  assert.equal(starts[0], 0.25);
  assert.equal(starts[1], 2);
  assert.ok(starts[2] > 2);
});

test('counts keep the way a number was written', () => {
  assert.equal(parseCount('10.000+').format(5000), '5.000+');
  assert.equal(parseCount('87%').format(43.4), '43%');
  assert.equal(parseCount('4,8').format(2.4), '2,4');
  assert.equal(parseCount('Rp25 rb').format(25), 'Rp25 rb');
  assert.equal(parseCount('tanpa angka'), null);
});

test('chat, line and flow layers keep their own fields', async () => {
  const { cleanScene } = await import('../../components/motion/sceneKinds.js');
  const scene = cleanScene({
    kind: 'layers', transition: 'teleport',
    layers: [
      { type: 'chat', text: 'Rina', messages: [{ from: 'them', text: 'Halo' }, { from: 'bot', text: 'jadi them' }, { from: 'me', text: '' }, ...Array(8).fill({ from: 'me', text: 'x' })] },
      { type: 'line', values: Array.from({ length: 15 }, (_, i) => i), value: '+200%' },
      { type: 'flow', items: ['Pesan', 'Seduh', 'Antar', 'Nikmati', 'Ulangi'] },
    ],
  });
  assert.equal(scene.transition, 'fade');
  assert.equal(scene.layers[0].messages.length, 5);
  assert.equal(scene.layers[0].messages[1].from, 'them');
  assert.equal(scene.layers[1].values.length, 12);
  assert.equal(scene.layers[2].items.length, 4);
});

test('sound effects land on the scene moments, whoosh before the cut, and stay sparse', async () => {
  const { sceneSfx, chatTimes } = await import('../../components/motion/sceneKinds.js');
  const first = sceneSfx({ kind: 'text', title: 'Hook', cta: 'Beli', transition: 'fade' }, 0);
  assert.deepEqual(first.map((e) => e.name), ['impact', 'pop']);
  const next = sceneSfx({ kind: 'layers', transition: 'wipe', layers: [{ type: 'list', entrance: 'slide-up', items: ['a', 'b', 'c', 'd'] }, { type: 'button', entrance: 'spring', text: 'Go' }, { type: 'badge', entrance: 'elastic', text: 'X' }] }, 2);
  assert.equal(next[0].name, 'whoosh');
  assert.ok(next[0].at < 0);
  assert.ok(next.length <= 6);
  assert.equal(sceneSfx({ kind: 'text', title: 'x', transition: 'cut' }, 1).length, 0);
  const times = chatTimes([{ from: 'them', text: 'a' }, { from: 'me', text: 'b' }, { from: 'them', text: 'c' }], 1);
  assert.equal(times.messages[0].typing, null);
  assert.ok(times.messages[2].typing > times.messages[1].at && times.messages[2].at > times.messages[2].typing);
});

test('voiceover word timings are kept with the audio file', async () => {
  const { cleanAudioFile } = await import('../../components/motion/sceneKinds.js');
  const url = '/api/assets/22222222-2222-4222-8222-222222222222/download?workspace_id=11111111-1111-4111-8111-111111111111';
  assert.deepEqual(cleanAudioFile({ url, seconds: 2, words: [{ w: 'Halo', s: 0, e: 0.4 }, { w: '', s: 1, e: 2 }] }).words, [{ w: 'Halo', s: 0, e: 0.4 }]);
});

test('lottie layers resolve the AI\'s names to the animated emoji library and refuse other hosts', async () => {
  const { cleanLayer } = await import('../../components/motion/sceneKinds.js');
  assert.deepEqual(cleanLayer({ type: 'lottie', src: 'hot beverage', size: 'xl' }), { type: 'lottie', entrance: 'scale', src: 'noto:hot-beverage', size: 'm', text: '' });
  assert.equal(cleanLayer({ type: 'lottie', src: 'https://assets-v2.lottiefiles.com/a/x/y.json' }).src, 'https://assets-v2.lottiefiles.com/a/x/y.json');
  assert.equal(cleanLayer({ type: 'lottie', src: 'https://example.com/y.json' }).src, '');
  const { emojiChar, lottieUrl } = await import('../../components/motion/lottieLibrary.js');
  assert.equal(emojiChar('rocket'), '🚀');
  assert.equal(lottieUrl('noto:rocket'), 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f680/lottie.json');
});

test('layers come in on the words of the voiceover that name them', async () => {
  const { layerStarts } = await import('../../components/motion/sceneKinds.js');
  const words = 'Tips pertama, bersihkan wajah dua kali sehari saja: pagi dan malam.'.split(' ').map((w, i) => ({ w, s: i * 0.4, e: i * 0.4 + 0.3 }));
  const layers = [{ type: 'kicker', text: 'TIPS 1', entrance: 'fade' }, { type: 'heading', text: 'Bersihkan wajah 2x sehari', entrance: 'slide-up' }, { type: 'lottie', src: 'noto:droplet', entrance: 'scale' }, { type: 'text', text: 'Pagi dan malam', entrance: 'fade' }];
  const starts = layerStarts(layers, words, 0.5);
  assert.ok(Math.abs(starts[1] - (0.5 + 0.8 - 0.2)) < 1e-9, 'heading on "bersihkan"');
  assert.ok(Math.abs(starts[3] - (0.5 + 3.2 - 0.2)) < 1e-9, 'text on "pagi"');
  assert.ok(starts.every((start, i) => i === 0 || start > starts[i - 1]), 'never out of order');
  assert.deepEqual(layerStarts(layers), layerStarts(layers, null), 'without words the stagger is unchanged');
});
