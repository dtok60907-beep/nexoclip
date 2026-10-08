import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = new URL('../../src/db/migrations/029_generation_pricing_snapshot.sql', import.meta.url);

test('snapshot migration separates nullable provider USD estimates from credit quotes', async () => {
  const sql = await readFile(migration, 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS estimated_provider_cost_usd NUMERIC\(20, 8\)/);
  assert.match(sql, /CHECK \(estimated_provider_cost_usd >= 0 AND estimated_provider_cost_usd <> 'NaN'::numeric\)/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB/);
  assert.match(sql, /CHECK \(jsonb_typeof\(pricing_snapshot\) = 'object'\)/);
  assert.doesNotMatch(sql, /UPDATE generation_jobs/);
  assert.doesNotMatch(sql.split(';')[0], /NOT NULL|DEFAULT/);
});

test('snapshot migration protects quoted inputs while allowing normal job updates', async () => {
  const sql = await readFile(migration, 'utf8');
  assert.match(sql, /IF OLD\.pricing_snapshot IS NOT NULL AND/);
  assert.match(sql, /NEW\.pricing_snapshot IS DISTINCT FROM OLD\.pricing_snapshot/);
  assert.match(sql, /NEW\.estimated_provider_cost_usd IS DISTINCT FROM OLD\.estimated_provider_cost_usd/);
  assert.match(sql, /BEFORE UPDATE OF pricing_snapshot, estimated_provider_cost_usd ON generation_jobs/);
  assert.match(sql, /FOR EACH ROW EXECUTE FUNCTION guard_generation_pricing_snapshot\(\)/);
});
