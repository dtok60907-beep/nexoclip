import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';
import { createImageGeneration, findGeneration, findGenerationByIdempotencyKey } from '../../src/repositories/generationRepository.js';
import { recordProviderUsage } from '../../src/repositories/generationOutputRepository.js';

const databaseUrl = process.env.NEXOCLIP_TEST_DATABASE_URL;
const skip = !databaseUrl && 'NEXOCLIP_TEST_DATABASE_URL is required (dedicated test database)';
const migrations = new URL('../../src/db/migrations/', import.meta.url);

// The COGS migration can also be verified on local PostgreSQL 14. The complete
// application's pre-existing FK column-list syntax requires PostgreSQL 15+.
const minimalSchema = `
  CREATE TABLE workspaces (id UUID PRIMARY KEY, name TEXT, slug TEXT);
  CREATE TABLE assets (
    id UUID PRIMARY KEY, workspace_id UUID NOT NULL REFERENCES workspaces(id),
    filename TEXT, content_type TEXT, storage_key TEXT
  );
  CREATE TABLE generation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL REFERENCES workspaces(id),
    created_by_user_id UUID, project_id UUID, kind TEXT DEFAULT 'image', status TEXT DEFAULT 'queued',
    prompt TEXT, model TEXT, parameters JSONB, result JSONB, error JSONB,
    estimated_cost NUMERIC(20,6), pricing_version_id UUID, reservation_ledger_id UUID,
    settlement_status TEXT DEFAULT 'pending', idempotency_key TEXT, attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3, next_attempt_at TIMESTAMPTZ, timeout_at TIMESTAMPTZ,
    vimax_session_id TEXT, provider TEXT, provider_request_id TEXT, progress INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
    started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ,
    UNIQUE (workspace_id, idempotency_key)
  );
`;

async function withSchema(t, fullBaseline, run) {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  const schema = `pricing_snapshot_test_${randomUUID().replaceAll('-', '')}`;
  try {
    const version = await client.query('SHOW server_version_num');
    if (fullBaseline && Number(version.rows[0].server_version_num) < 150000) {
      t.skip('Full baseline requires PostgreSQL 15+; existing FK syntax is unsupported on PostgreSQL 14');
      return;
    }
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}, public`);
    if (fullBaseline) {
      for (const filename of (await readdir(migrations)).filter((name) => name.endsWith('.sql')).sort()) {
        await client.query(await readFile(new URL(filename, migrations), 'utf8'));
      }
    } else {
      await client.query(minimalSchema);
      await client.query(await readFile(new URL('013_generation_outputs_usage.sql', migrations), 'utf8'));
      await client.query(await readFile(new URL('029_generation_pricing_snapshot.sql', migrations), 'utf8'));
    }
    const workspaceId = randomUUID();
    await client.query(`INSERT INTO workspaces (id, name, slug) VALUES ($1, 'Quote test', $2)`, [workspaceId, schema]);
    await run(client, workspaceId);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
}

async function verifyAdmission(client, workspaceId) {
  const snapshot = { version: 1, usdToIdrRate: 15500, markupPercent: 60, creditsPerIdr: 0.01 };
  const job = await createImageGeneration(client, {
    workspaceId, projectId: null, prompt: 'fox', model: 'flux-dev', parameters: {},
    idempotencyKey: 'accepted-quote', estimatedCost: 1.24, pricingVersionId: null, reservationLedgerId: null,
    estimatedProviderCostUsd: 0.005, pricingSnapshot: snapshot,
  });
  assert.equal(job.estimated_provider_cost_usd, '0.00500000');
  assert.deepEqual(job.pricing_snapshot, snapshot);
  assert.deepEqual((await findGeneration(client, workspaceId, job.id)).pricing_snapshot, snapshot);
  assert.equal(await findGeneration(client, randomUUID(), job.id), null);
  assert.deepEqual((await findGenerationByIdempotencyKey(client, workspaceId, 'accepted-quote')).pricing_snapshot, snapshot);

  await client.query(`UPDATE generation_jobs SET status = 'running', progress = 10 WHERE id = $1`, [job.id]);
  await client.query(`UPDATE generation_jobs SET pricing_snapshot = $2::jsonb, estimated_provider_cost_usd = $3 WHERE id = $1`, [job.id, JSON.stringify(snapshot), 0.005]);
  assert.equal((await findGeneration(client, workspaceId, job.id)).status, 'running');

  async function rejectsCheck(sql, values, constraint) {
    await client.query('SAVEPOINT invalid_quote');
    try {
      await assert.rejects(client.query(sql, values), (error) => {
        assert.equal(error.code, '23514');
        if (constraint) assert.equal(error.constraint, constraint);
        return true;
      });
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT invalid_quote');
      await client.query('RELEASE SAVEPOINT invalid_quote');
    }
  }

  await rejectsCheck(`UPDATE generation_jobs SET pricing_snapshot = '{}'::jsonb WHERE id = $1`, [job.id]);
  await rejectsCheck(`UPDATE generation_jobs SET pricing_snapshot = NULL WHERE id = $1`, [job.id]);
  await rejectsCheck(`UPDATE generation_jobs SET estimated_provider_cost_usd = 0.01 WHERE id = $1`, [job.id]);
  await rejectsCheck(`UPDATE generation_jobs SET estimated_provider_cost_usd = NULL WHERE id = $1`, [job.id]);

  const legacy = await createImageGeneration(client, {
    workspaceId, projectId: null, prompt: 'legacy', model: 'flux-dev', parameters: {},
  });
  assert.equal(legacy.estimated_provider_cost_usd, null);
  assert.equal(legacy.pricing_snapshot, null);
  await client.query(`UPDATE generation_jobs SET status = 'running' WHERE id = $1`, [legacy.id]);
  await rejectsCheck(`UPDATE generation_jobs SET estimated_provider_cost_usd = -0.01 WHERE id = $1`, [legacy.id], 'generation_jobs_provider_estimate_nonnegative');
  await rejectsCheck(`UPDATE generation_jobs SET estimated_provider_cost_usd = 'NaN'::numeric WHERE id = $1`, [legacy.id], 'generation_jobs_provider_estimate_nonnegative');
  for (const value of ['[]', 'null', '1', '"invalid"']) {
    await rejectsCheck(`UPDATE generation_jobs SET pricing_snapshot = $2::jsonb WHERE id = $1`, [legacy.id, value], 'generation_jobs_pricing_snapshot_object');
  }
  await client.query(`UPDATE generation_jobs SET pricing_snapshot = '{}'::jsonb, estimated_provider_cost_usd = 0 WHERE id = $1`, [legacy.id]);
  assert.equal((await findGeneration(client, workspaceId, legacy.id)).estimated_provider_cost_usd, '0.00000000');
  await rejectsCheck(`UPDATE generation_jobs SET estimated_provider_cost_usd = 0.01 WHERE id = $1`, [legacy.id]);
  return job;
}

test('COGS migrations enforce quote immutability and preserve trustworthy USD usage on replay', { skip }, async (t) => {
  await withSchema(t, false, async (client, workspaceId) => {
    const job = await verifyAdmission(client, workspaceId);
    // Simulate a historical worker that wrote credit units to estimated_cost.
    await client.query(`INSERT INTO provider_usage
      (workspace_id, generation_job_id, provider, provider_request_id, estimated_cost, actual_cost)
      VALUES ($1, $2, 'muapi', 'legacy-credits', 123, 0.5)`, [workspaceId, job.id]);
    await client.query(await readFile(new URL('030_provider_usage_cost_units.sql', migrations), 'utf8'));
    const historical = (await client.query(`SELECT * FROM provider_usage WHERE provider_request_id = 'legacy-credits'`)).rows[0];
    assert.equal(historical.estimated_cost, '123.00000000');
    assert.equal(historical.cost_currency, null, 'historical values must remain in an unknown currency');
    assert.equal(historical.cost_source, 'legacy');

    const unknown = await recordProviderUsage(client, {
      workspaceId, generationId: job.id, provider: 'muapi', providerRequestId: 'legacy-credits',
    });
    assert.equal(unknown.estimated_cost, null, 'replay must not relabel historical credits as USD');
    assert.equal(unknown.actual_cost, null, 'unconfirmed historical cost must not be relabeled as USD');
    assert.equal(unknown.cost_currency, 'USD');
    assert.equal(unknown.cost_source, 'unknown');

    for (const actualCost of [0, 0.01]) {
      const providerRequestId = `reported-${actualCost}`;
      await recordProviderUsage(client, {
        workspaceId, generationId: job.id, provider: 'muapi', providerRequestId,
        estimatedCost: 0.005, actualCost, units: { seconds: 1 }, rawUsage: { cost: actualCost },
      });
      const replay = await recordProviderUsage(client, {
        workspaceId, generationId: job.id, provider: 'muapi', providerRequestId,
      });
      assert.equal(replay.actual_cost, actualCost.toFixed(8));
      assert.equal(replay.estimated_cost, '0.00500000');
      assert.equal(replay.cost_currency, 'USD');
      assert.equal(replay.cost_source, 'reported');
      assert.deepEqual(replay.units, { seconds: 1 });
      assert.deepEqual(replay.raw_usage, { cost: actualCost });
    }
  });
});

test('migrates the full application from a fresh schema and admits an immutable quote', { skip }, async (t) => {
  await withSchema(t, true, verifyAdmission);
});
