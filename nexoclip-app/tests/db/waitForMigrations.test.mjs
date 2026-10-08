import test from 'node:test';
import assert from 'node:assert/strict';
import { listMigrationFiles, pendingMigrations, waitForMigrations } from '../../src/db/migrate.js';

function poolReturning(...responses) {
  let calls = 0;
  return {
    get calls() { return calls; },
    async query() {
      const response = responses[Math.min(calls++, responses.length - 1)];
      if (response instanceof Error) throw response;
      return { rows: response.map((filename) => ({ filename })) };
    },
  };
}

const missingTable = () => Object.assign(new Error('relation "schema_migrations" does not exist'), { code: '42P01' });

test('treats every migration as pending before the tracking table exists', async () => {
  const all = await listMigrationFiles();
  assert.deepEqual(await pendingMigrations(poolReturning(missingTable())), all);
});

test('waits until the deploy migration has recorded every bundled file', async () => {
  const all = await listMigrationFiles();
  const pool = poolReturning(all.slice(0, -1), all.slice(0, -1), all);
  const sleeps = [];
  const logs = [];
  await waitForMigrations({ pool, intervalMs: 7, sleep: async (ms) => { sleeps.push(ms); }, log: (line) => logs.push(line) });
  assert.equal(pool.calls, 3);
  assert.deepEqual(sleeps, [7, 7]);
  assert.match(logs[0], new RegExp(all.at(-1)));
});

test('gives up after the timeout so the platform restarts the service', async () => {
  let clock = 0;
  await assert.rejects(
    waitForMigrations({ pool: poolReturning([]), intervalMs: 10, timeoutMs: 25, log: () => {}, now: () => clock, sleep: async (ms) => { clock += ms; } }),
    /Timed out waiting for migrations/,
  );
});

test('surfaces database errors other than a missing tracking table', async () => {
  await assert.rejects(pendingMigrations(poolReturning(new Error('connection refused'))), /connection refused/);
});
