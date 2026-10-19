import test from 'node:test';
import assert from 'node:assert/strict';

const { historyEntryFromJob, mergeHistory } = await import('../../packages/studio/src/lib/serverHistory.js');

test('a succeeded job with an output becomes a history entry; others do not', () => {
  const entry = historyEntryFromJob({ id: 'g1', status: 'succeeded', prompt: 'a cat', model: 'bytedance/seedance-2.0', params: { resolution: '720p', aspectRatio: '9:16', duration: 10 }, result: { outputUrl: '/api/assets/a/download' }, createdAt: '2026-10-17T10:00:00Z' });
  assert.deepEqual({ ...entry }, { id: 'g1', url: '/api/assets/a/download', prompt: 'a cat', model: 'bytedance/seedance-2.0', resolution: '720p', aspect_ratio: '9:16', duration: 10, timestamp: '2026-10-17T10:00:00Z', fromServer: true });
  assert.equal(historyEntryFromJob({ id: 'g2', status: 'failed', result: {} }), null);
  assert.equal(historyEntryFromJob({ id: 'g3', status: 'succeeded', result: {} }), null);
});

test('server and local history merge once per generation, newest first, without hidden entries', () => {
  const server = [{ id: 'a', url: 'u-a', timestamp: '2026-10-17T10:00:00Z' }, { id: 'b', url: 'u-b', timestamp: '2026-10-17T11:00:00Z' }];
  const local = [{ id: 'b', url: 'u-b-local', timestamp: '2026-10-17T11:00:00Z' }, { id: 'c', url: 'u-c', timestamp: '2026-10-17T12:00:00Z' }];
  assert.deepEqual(mergeHistory(server, local, ['a']).map((e) => e.id), ['c', 'b']);
});
