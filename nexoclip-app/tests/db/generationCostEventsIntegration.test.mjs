import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { recordGenerationCostObservation } from '../../src/services/generationCostService.js';
import { listGenerationCostObservations } from '../../src/repositories/generationCostRepository.js';
import { estimateGenerationCredits } from '../../src/services/generationPricing.js';

const databaseUrl = process.env.NEXOCLIP_TEST_DATABASE_URL;

test('append-only cost facts deduplicate resumed requests and keep failed, fallback and unknown charges', {
  skip: !databaseUrl && 'NEXOCLIP_TEST_DATABASE_URL is required (dedicated test database)',
}, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  const schema = `generation_cost_test_${randomUUID().replaceAll('-', '')}`;
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}, public`);
    await client.query(`CREATE TABLE workspaces (id UUID PRIMARY KEY);
      CREATE TABLE generation_jobs (id UUID PRIMARY KEY, workspace_id UUID NOT NULL REFERENCES workspaces(id),
        UNIQUE (workspace_id, id));`);
    const migration = await readFile(new URL('../../src/db/migrations/031_generation_cost_events.sql', import.meta.url), 'utf8');
    await client.query(migration);
    await client.query(migration);
    await client.query(await readFile(new URL('../../src/db/migrations/039_generation_provider_account.sql',import.meta.url),'utf8'));
    const workspaceId = randomUUID();
    const otherWorkspaceId = randomUUID();
    const generationId = randomUUID();
    await client.query('INSERT INTO workspaces (id) VALUES ($1), ($2)', [workspaceId, otherWorkspaceId]);
    await client.query('INSERT INTO generation_jobs (id, workspace_id) VALUES ($1, $2)', [generationId, workspaceId]);
    const quote = await estimateGenerationCredits({ kind: 'image', model: 'byteplus/seedream-4.5', parameters: {} }, {
      env: { USD_IDR_RATE: '17915', CREDIT_MARKUP_PERCENT: '60' },
    });
    const job = { id: generationId, workspace_id: workspaceId, kind: 'image', model: 'byteplus/seedream-4.5',
      pricing_snapshot: quote.pricingSnapshot, attempt_count: 1 };
    const dispatchId = randomUUID();
    const record = (observation, attempt = 1) => recordGenerationCostObservation(client, {
      job: { ...job, attempt_count: attempt }, observation: { provider: 'openrouter', dispatchId, ...observation },
    });
    await record({ provider: 'worker', eventType: 'attempt_started' });
    await record({ eventType: 'dispatch' });
    const known = await record({ eventType: 'succeeded', providerRequestId: 'request-1', usage: { costUsd: 1 } });
    const duplicate = await record({ eventType: 'succeeded', providerRequestId: 'request-1', usage: { costUsd: 1 } }, 2);
    assert.equal(duplicate, null);
    const resumedDispatchId = randomUUID();
    await record({ provider: 'worker', dispatchId: resumedDispatchId, eventType: 'attempt_started' }, 2);
    await record({ dispatchId: resumedDispatchId, eventType: 'submitted', providerRequestId: 'request-1', usage: {} }, 2);
    const correction = await record({ dispatchId: resumedDispatchId, eventType: 'reconciled', providerRequestId: 'request-1', usage: { costUsd: 0.7 } }, 2);
    assert.ok(Number(correction.id) > Number(known.id));
    await record({ dispatchId: resumedDispatchId, eventType: 'timeout', providerRequestId: 'request-1', usage: {} }, 2);
    await record({ dispatchId: randomUUID(), eventType: 'failed', providerRequestId: 'charged-failure', usage: { costUsd: 0.2 } });
    await record({ provider: 'byteplus', dispatchId: randomUUID(), eventType: 'succeeded', providerRequestId: 'fallback-success', usage: { generated_images: 1 } });
    const unknownDispatchId = randomUUID();
    await record({ dispatchId: unknownDispatchId, eventType: 'dispatch' });
    await record({ dispatchId: unknownDispatchId, eventType: 'failed', usage: {} });

    const observations = await listGenerationCostObservations(client, workspaceId, generationId);
    assert.equal(observations.length, 4, 'attempt and bound dispatch markers must not create duplicate charges');
    assert.equal(observations.find((row) => row.provider_request_id === 'request-1').cost_usd, '0.70000000');
    assert.equal(observations.find((row) => row.provider_request_id === 'charged-failure').cost_usd, '0.20000000');
    assert.equal(observations.find((row) => row.provider_request_id === 'fallback-success').cost_idr, '716.600000');
    assert.equal(observations.find((row) => row.provider_request_id === null).cost_usd, null);
    assert.equal(observations.reduce((sum, row) => sum + Number(row.cost_usd || 0), 0).toFixed(2), '0.94');
    assert.deepEqual(await listGenerationCostObservations(client, otherWorkspaceId, generationId), []);
    const coverage = await client.query('SELECT COUNT(DISTINCT worker_attempt)::integer AS count FROM generation_cost_events');
    assert.equal(coverage.rows[0].count, 2);

    async function rejects(sql, values, code) {
      await client.query('SAVEPOINT invalid_cost');
      try { await assert.rejects(client.query(sql, values), { code }); }
      finally {
        await client.query('ROLLBACK TO SAVEPOINT invalid_cost');
        await client.query('RELEASE SAVEPOINT invalid_cost');
      }
    }
    await rejects('UPDATE generation_cost_events SET cost_usd = 9 WHERE id = $1', [known.id], '23514');
    await rejects('DELETE FROM generation_cost_events WHERE id = $1', [known.id], '23514');
    await client.query('SAVEPOINT wrong_workspace');
    try {
      await assert.rejects(recordGenerationCostObservation(client, {
        job: { ...job, workspace_id: otherWorkspaceId }, observation: {
          provider: 'openrouter', dispatchId: randomUUID(), eventType: 'succeeded', providerRequestId: 'cross-tenant', usage: { costUsd: 1 },
        },
      }), { code: '23503' });
    } finally { await client.query('ROLLBACK TO SAVEPOINT wrong_workspace'); }
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
