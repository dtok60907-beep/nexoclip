import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDoc, cleanName, createMotionProject, deleteMotionProject, updateMotionProject } from './motionProjects.js';

const doc = { styleId: 'pop-ceria', format: '16:9', scenes: [{ title: 'Halo', subtitle: '', cta: '', seconds: 4 }], custom: {}, chat: [] };

function fakePool(rows = [], rowCount = rows.length) {
  const calls = [];
  return { calls, query: async (sql, params) => { calls.push({ sql, params }); return { rows, rowCount }; } };
}

test('cleanDoc keeps a playable document and drops what the studio cannot use', () => {
  const cleaned = cleanDoc({
    styleId: 'nope', format: '4:3', extra: 'x',
    scenes: [...Array.from({ length: 64 }, () => ({ title: 'T'.repeat(100), seconds: 99 }))],
    custom: { family: 'retro', font: 'serif', palette: { bg: '#112233', fg: 'red', accent: 'javascript:1' } },
    chat: [{ role: 'system', content: 'x' }, { role: 'user', content: 'promo' }, { role: 'assistant', content: 'ok', credits: 0.4, plan: { styleId: 'pop-ceria', scenes: [{ seconds: 4, title: 'dropped' }] } }],
  });
  assert.equal(cleaned.styleId, 'auto');
  assert.equal(cleaned.format, '9:16');
  assert.equal(cleaned.extra, undefined);
  assert.equal(cleaned.scenes.length, 60);
  assert.equal(cleaned.scenes[0].title.length, 60);
  assert.equal(cleaned.scenes[0].seconds, 12);
  assert.deepEqual(cleaned.custom.palette, { bg: '#112233' });
  assert.deepEqual(cleaned.chat.map((m) => m.role), ['user', 'assistant']);
  assert.deepEqual(cleaned.chat[1].plan, { styleId: 'pop-ceria', scenes: [{ seconds: 4 }] });
  assert.throws(() => cleanDoc({ scenes: [] }), /minimal satu adegan/);
  assert.throws(() => cleanName('   '), /wajib/);
});

test('create, update and delete are scoped to the workspace', async () => {
  const row = { id: 'p1', name: 'Promo', doc, created_at: 'c', updated_at: 'u' };
  const created = fakePool([row]);
  const project = await createMotionProject(created, { workspaceId: 'ws', userId: 'u1', name: '  Promo  kopi ', doc });
  assert.equal(created.calls[0].params[2], 'Promo kopi');
  assert.equal(project.sceneCount, 1);

  const renamed = fakePool([row]);
  await updateMotionProject(renamed, 'ws', 'p1', { name: 'Baru' });
  assert.deepEqual(renamed.calls[0].params.slice(0, 4), ['ws', 'p1', 'Baru', null]);
  assert.match(renamed.calls[0].sql, /WHERE workspace_id = \$1 AND id = \$2/);
  await assert.rejects(updateMotionProject(renamed, 'ws', 'p1', {}), /Tidak ada/);

  assert.equal(await deleteMotionProject(fakePool([], 0), 'ws', 'p1'), false);
  assert.equal(await deleteMotionProject(fakePool([], 1), 'ws', 'p1'), true);
});

test('cleanDoc keeps generated audio only when it points at a workspace asset', () => {
  const asset = '/api/assets/22222222-2222-4222-8222-222222222222/download?workspace_id=11111111-1111-4111-8111-111111111111';
  const cleaned = cleanDoc({
    scenes: [
      { title: 'A', vo: 'Halo', voAudio: { url: asset, seconds: 1.234, text: 'Halo', voiceId: 'JBFqnCBsd6RMkjVDRZzb' } },
      { title: 'B', vo: 'x', voAudio: { url: 'https://evil.example/a.mp3', seconds: 2 } },
    ],
    audio: { voiceId: 'JBFqnCBsd6RMkjVDRZzb', musicPrompt: 'lo-fi', musicVolume: 3, music: { url: asset, seconds: 30, text: 'lo-fi' } },
  });
  assert.deepEqual(cleaned.scenes[0].voAudio, { url: asset, seconds: 1.23, text: 'Halo', voiceId: 'JBFqnCBsd6RMkjVDRZzb' });
  assert.equal(cleaned.scenes[1].voAudio, undefined);
  assert.equal(cleaned.audio.musicVolume, 1);
  assert.equal(cleaned.audio.music.url, asset);
});
