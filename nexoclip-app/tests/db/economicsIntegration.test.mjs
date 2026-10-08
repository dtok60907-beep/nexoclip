import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { getEconomicsReport } from '../../src/repositories/economicsRepository.js';
import { mapEconomicsTotals } from '../../src/services/economicsService.js';

const databaseUrl = process.env.NEXOCLIP_TEST_DATABASE_URL;
const skip = !databaseUrl && 'NEXOCLIP_TEST_DATABASE_URL is required (dedicated test database)';
const migrations = new URL('../../src/db/migrations/', import.meta.url);

async function fixture(run) {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  const schema = `economics_test_${randomUUID().replaceAll('-', '')}`;
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}, public`);
    await client.query(`CREATE TABLE workspaces(id UUID PRIMARY KEY);
      CREATE TABLE users(id UUID PRIMARY KEY);
      CREATE TABLE credit_topups(id UUID PRIMARY KEY, workspace_id UUID NOT NULL REFERENCES workspaces(id));
      CREATE TABLE generation_jobs (
        id UUID PRIMARY KEY, workspace_id UUID NOT NULL REFERENCES workspaces(id),
        model TEXT, provider TEXT, kind TEXT DEFAULT 'image', status TEXT, settlement_status TEXT,
        estimated_cost NUMERIC(20,6), reservation_ledger_id UUID, attempt_count INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT '2026-09-01T00:00:00Z', finished_at TIMESTAMPTZ DEFAULT '2026-10-05T12:00:00Z',
        UNIQUE(workspace_id,id)
      );`);
    for (const name of ['007_credits.sql', '031_generation_cost_events.sql', '032_credit_lots.sql', '033_payment_fee_reconciliation.sql', '036_credit_revenue_simulation.sql','039_generation_provider_account.sql','041_generation_environment.sql']) {
      await client.query(await readFile(new URL(name, migrations), 'utf8'));
    }
    const workspaceId = randomUUID();
    await client.query('INSERT INTO workspaces(id) VALUES($1)', [workspaceId]);
    let sequence = 0;
    async function ledger(amount, reason, metadata = {}, workspace = workspaceId) {
      const result = await client.query(`INSERT INTO credit_ledger(workspace_id,amount,balance_after,reason,idempotency_key,metadata)
        VALUES($1,$2,1000,$3,$4,$5::jsonb) RETURNING id`, [workspace, amount, reason, randomUUID(), JSON.stringify(metadata)]);
      return result.rows[0].id;
    }
    async function job({ environment='unclassified',consumed = 5, reserved = 10, model = 'model-a', status = 'succeeded', settlement = 'captured', attempts = 1, workspace = workspaceId, finishedAt = '2026-10-05T12:00:00Z' } = {}) {
      const id = randomUUID();
      const reservation = await ledger(-reserved, 'generation_reservation', {}, workspace);
      await client.query(`INSERT INTO generation_jobs(id,workspace_id,model,provider,status,settlement_status,estimated_cost,reservation_ledger_id,attempt_count,finished_at,environment)
        VALUES($1,$2,$3,'provider-a',$4,$5,$6,$7,$8,$9,$10)`, [id, workspace, model, status, settlement, reserved, reservation, attempts, finishedAt,environment]);
      if (settlement === 'captured' && consumed < reserved) await ledger(reserved - consumed, 'generation_capture', { generationId: id }, workspace);
      return id;
    }
    async function allocation(generationId, { consumed = 5, reserved = 10, source = 'paid', amountIdr = 1000, feeIdr = 100, finalized = true, granted = 10 } = {}) {
      const sourceLedger = ['legacy', 'unknown'].includes(source) ? null : await ledger(granted, source === 'paid' ? 'topup' : 'promo');
      const lot = (await client.query(`INSERT INTO credit_lots(workspace_id,source_ledger_id,source_type,granted_credits,available_credits,amount_idr,payment_fee_idr)
        VALUES($1,$2,$3,$6,0,$4,$5) RETURNING id`, [workspaceId, sourceLedger, source, amountIdr, feeIdr, granted])).rows[0].id;
      await client.query(`INSERT INTO generation_credit_allocations(workspace_id,generation_job_id,lot_id,reserved_credits,consumed_credits,returned_credits,finalized_at)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [workspaceId, generationId, lot, reserved, finalized ? consumed : 0, finalized ? reserved - consumed : 0, finalized ? new Date('2026-10-05T12:00:00Z') : null]);
      return lot;
    }
    async function event(generationId, { request = randomUUID(), dispatch = randomUUID(), attempt = 1, type = 'succeeded', usd = 0.01, idr = 150, source = 'reported', workspace = workspaceId, account = null } = {}) {
      const fingerprint = createHash('sha256').update(String(sequence++)).digest('hex');
      await client.query(`INSERT INTO generation_cost_events(workspace_id,generation_job_id,provider,provider_request_id,dispatch_id,worker_attempt,event_type,observation_fingerprint,cost_usd,cost_idr,usd_idr_rate,cost_source,provider_account_id)
        VALUES($1,$2,'provider-a',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [workspace, generationId, request, dispatch, attempt, type, fingerprint, usd, idr, idr !== null && usd !== null && usd > 0 ? idr / usd : null, source, account]);
    }
    const report = (extra = {}) => getEconomicsReport(client, { workspaceId, since: '2026-10-01T00:00:00Z', until: '2026-10-08T00:00:00Z', ...extra });
    await run({ client, workspaceId, job, allocation, event, report });
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
}

test('economics recognizes finalized sale value and each incurred provider request once', { skip }, async () => {
  await fixture(async ({ job, allocation, event, report }) => {
    const id = await job({ attempts: 3 });
    await allocation(id);
    const failed = randomUUID();
    const success = randomUUID();
    await event(id, { request: failed, attempt: 1, type: 'failed', usd: 0.02, idr: 300 });
    await event(id, { request: success, attempt: 2, usd: 0.03, idr: 450 });
    await event(id, { request: success, attempt: 3, type: 'poll', usd: 0.03, idr: 450 });
    await event(id, { request: success, attempt: 3, type: 'timeout', usd: null, idr: null, source: 'unknown' });
    const result = await report();
    const totals = mapEconomicsTotals(result.totals);
    assert.equal(totals.recognizedRevenueIdr, 500);
    assert.equal(totals.paymentFeeIdr, 50);
    assert.equal(totals.providerRequestCount, 2);
    assert.equal(totals.providerCostIdr, 750);
    assert.equal(totals.providerCostUsd, 0.05);
    assert.equal(totals.contributionIdr, -300);
    assert.equal(totals.coverage.complete, true);
    assert.equal(result.items[0].id, id);
  });
});

test('sandbox-funded failures and other tenants are excluded while paid failures retain expenses', { skip }, async () => {
  await fixture(async ({ client, job, allocation, event, report }) => {
    const sandbox = await job({ consumed: 0, status: 'failed', settlement: 'released' });
    await allocation(sandbox, { consumed: 0, source: 'sandbox', amountIdr: 0, feeIdr: 0 });
    await event(sandbox, { usd: 1, idr: 15000 });
    const failure = await job({ consumed: 0, status: 'failed', settlement: 'released' });
    await allocation(failure, { consumed: 0 });
    await event(failure, { usd: 0.02, idr: 300, type: 'failed' });
    const otherWorkspace = randomUUID();
    await client.query('INSERT INTO workspaces(id) VALUES($1)', [otherWorkspace]);
    const otherJob = await job({ workspace: otherWorkspace });
    await event(otherJob, { workspace: otherWorkspace, usd: 10, idr: 150000 });
    const result = await report();
    const totals = mapEconomicsTotals(result.totals);
    assert.equal(Number(result.excludedSandboxJobs), 1);
    assert.equal(totals.jobCount, 1);
    assert.equal(totals.failedJobCount, 1);
    assert.equal(totals.recognizedRevenueIdr, 0);
    assert.equal(totals.providerCostIdr, 300);
    assert.equal(totals.contributionIdr, -300);
  });
});

test('unknown revenue, fees, FX and attempts never become a fabricated profit', { skip }, async () => {
  await fixture(async ({ job, allocation, event, report }) => {
    const unknownRevenue = await job({ model: 'unknown-revenue', attempts: 2 });
    await allocation(unknownRevenue, { source: 'legacy', amountIdr: null, feeIdr: null });
    await event(unknownRevenue, { usd: 0.01, idr: null });
    const unknownFee = await job({ model: 'unknown-fee' });
    await allocation(unknownFee, { feeIdr: null });
    await event(unknownFee, { request: null, type: 'dispatch', usd: null, idr: null, source: 'unknown' });
    const result = await report();
    const totals = mapEconomicsTotals(result.totals);
    assert.equal(totals.recognizedRevenueIdr, 500);
    assert.equal(totals.providerCostUsd, 0.01);
    assert.equal(totals.coverage.unknownRevenueCredits, 5);
    assert.equal(totals.coverage.unknownPaymentFeeCredits, 10);
    assert.equal(totals.coverage.unknownProviderRequests, 1);
    assert.equal(totals.coverage.unknownFxRequests, 1);
    assert.equal(totals.coverage.missingAttemptCount, 1);
    assert.equal(totals.paymentFeeIdr, null);
    assert.equal(totals.contributionIdr, null);
    assert.equal(totals.marginPercent, null);
  });
});

test('reports use terminal cohort dates and paginate with the same filtered total', { skip }, async () => {
  await fixture(async ({ job, report }) => {
    const inside = await job({ model: 'inside', finishedAt: '2026-10-01T00:00:00Z' });
    await job({ model: 'inside', finishedAt: '2026-10-07T23:59:59Z' });
    await job({ model: 'outside', finishedAt: '2026-10-08T00:00:00Z' });
    const result = await report({ model: 'inside', pageSize: 1, page: 2 });
    assert.equal(Number(result.total), 2);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].id, inside);
    assert.equal(Number(result.totals.job_count), 2);
    assert.equal(result.breakdown.length, 1);
    assert.equal(result.breakdown[0].group_key, 'inside');
    assert.equal(mapEconomicsTotals(result.totals).coverage.unobservedCostJobs, 2);
  });
});

test('partial poll costs remain visibly provisional until a provider terminal observation exists', { skip }, async () => {
  await fixture(async ({ job, allocation, event, report }) => {
    const id = await job();
    await allocation(id);
    const request = randomUUID();
    await event(id, { request, type: 'poll', usd: 0.01, idr: 150 });
    await event(id, { request, type: 'interrupted', usd: 0.01, idr: 150 });
    let totals = mapEconomicsTotals((await report()).totals);
    assert.equal(totals.providerCostIdr, 150);
    assert.equal(totals.coverage.provisionalProviderRequests, 1);
    assert.equal(totals.contributionIdr, null);
    await event(id, { request, type: 'interrupted', usd: 0.01, idr: 150 });
    totals = mapEconomicsTotals((await report()).totals);
    assert.equal(totals.coverage.provisionalProviderRequests, 1);
    assert.equal(totals.contributionIdr, null);
    await event(id, { request, type: 'reconciled', usd: 0.02, idr: 300 });
    totals = mapEconomicsTotals((await report()).totals);
    assert.equal(totals.providerCostIdr, 300);
    assert.equal(totals.coverage.provisionalProviderRequests, 0);
    assert.equal(totals.contributionIdr, 150);
  });
});

test('unfinalized lot reservations cannot recognize a sale and confirmed promo credits have zero revenue', { skip }, async () => {
  await fixture(async ({ job, allocation, event, report }) => {
    const unfinished = await job({ model: 'unfinished' });
    await allocation(unfinished, { finalized: false });
    await event(unfinished);
    const unfinishedTotals = mapEconomicsTotals((await report({ model: 'unfinished' })).totals);
    assert.equal(unfinishedTotals.recognizedRevenueIdr, 0);
    assert.equal(unfinishedTotals.coverage.unknownRevenueCredits, 5);
    assert.equal(unfinishedTotals.coverage.allocationMismatchJobs, 1);
    assert.equal(unfinishedTotals.contributionIdr, null);
    const promo = await job({ model: 'promo' });
    await allocation(promo, { source: 'promo', amountIdr: 0, feeIdr: 0 });
    await event(promo, { usd: 0, idr: 0 });
    const promoTotals = mapEconomicsTotals((await report({ model: 'promo' })).totals);
    assert.equal(promoTotals.recognizedRevenueIdr, 0);
    assert.equal(promoTotals.paymentFeeIdr, 0);
    assert.equal(promoTotals.providerCostIdr, 0);
    assert.equal(promoTotals.coverage.complete, true);
    assert.equal(promoTotals.contributionIdr, 0);
    assert.equal(promoTotals.marginPercent, null);
  });
});

test('specific trial simulation recognizes only consumed credits and preserves real revenue, other promo grants and fee provenance', {skip},async()=>{
 await fixture(async({client,workspaceId,job,allocation,event,report})=>{
  const actor=randomUUID();await client.query('INSERT INTO users(id) VALUES($1)',[actor]);
  const id=await job({model:'trial-simulation',consumed:7.2,reserved:7.2});
  const lot=await allocation(id,{source:'promo',granted:750,consumed:7.2,reserved:7.2,amountIdr:0,feeIdr:0});
  await event(id,{idr:805.58819});
  await client.query('INSERT INTO credit_revenue_simulations(workspace_id,lot_id,assumed_amount_idr,reference_credits,reason,recorded_by_user_id) VALUES($1,$2,149000,750,$3,$4)',[workspaceId,lot,'approved simulation',actor]);
  const unrelated=await job({model:'other-promo',consumed:3,reserved:3});await allocation(unrelated,{source:'promo',consumed:3,reserved:3,amountIdr:0,feeIdr:0});await event(unrelated,{usd:0,idr:0});
  const result=await report(),totals=mapEconomicsTotals(result.totals);
  assert.equal(totals.recognizedRevenueIdr,0);assert.equal(totals.simulation.revenueIdr,1430.4);assert.equal(totals.simulation.creditsConsumed,7.2);
  assert.ok(Math.abs(totals.simulation.contributionIdr-624.81181)<0.000001);
  assert.equal(mapEconomicsTotals((await report({model:'other-promo'})).totals).simulation,null);
  assert.equal((await client.query('SELECT source_type,amount_idr FROM credit_lots WHERE id=$1',[lot])).rows[0].source_type,'promo');
 });
});

 test('Economics isolates production, development and unclassified jobs without rewriting provenance',{skip},async()=>{
  await fixture(async({client,job,allocation,event,report})=>{
    let production;
    for(const environment of ['production','development','unclassified']){
      const id=await job({environment});await allocation(id);await event(id);
      if(environment==='production')production=id;
      assert.equal((await report({environment})).items.length,1);
    }
    for(const environment of ['production','development','unclassified']){
      const result=await report({environment});assert.equal(Number(result.totals.job_count),1);
      assert.equal(Number(result.totals.recognized_revenue_idr),500);
      assert.equal(Number(result.totals.provider_cost_idr),150);
      assert.equal(result.items[0].environment,environment);
    }
    assert.equal(Number((await report({environment:'all'})).totals.job_count),3);
    await client.query('SAVEPOINT environment_edit');
    await assert.rejects(client.query("UPDATE generation_jobs SET environment='development' WHERE id=$1",[production]),/immutable/);
    await client.query('ROLLBACK TO SAVEPOINT environment_edit');
  });
 });

 test('terminal costs from another provider account cannot finalize a provisional request', { skip }, async () => {
  await fixture(async ({ job, allocation, event, report }) => {
    const id = await job();
    await allocation(id);
    const request = randomUUID();
    await event(id, { request, account: '123', type: 'succeeded' });
    await event(id, { request, account: '456', type: 'poll' });
    let totals = mapEconomicsTotals((await report()).totals);
    assert.equal(totals.providerCostIdr, 300);
    assert.equal(totals.coverage.provisionalProviderRequests, 1);
    assert.equal(totals.contributionIdr, null);
    await event(id, { request, account: '456', type: 'succeeded' });
    totals = mapEconomicsTotals((await report()).totals);
    assert.equal(totals.coverage.provisionalProviderRequests, 0);
    assert.equal(totals.contributionIdr, 150);
  });
});
