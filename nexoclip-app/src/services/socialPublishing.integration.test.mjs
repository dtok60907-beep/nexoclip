import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from '../db/migrate.js';
import { closePool } from '../db/pool.js';
import { createPublishJob, executePublishJob } from './tiktokService.mjs';
import { createPhotoPublishJob } from './tiktokPhotoPublishing.mjs';
import { saveSocialPublishDraft, getSocialPublishDraft, deleteSocialPublishDraft } from './socialPublishDrafts.mjs';
import { actOnSocialPublishJob } from './socialPublishActions.mjs';
import { findSocialPublishJob } from '../repositories/socialPublishRepository.mjs';

// Run only against a newly created disposable local database; no TikTok calls are made.
test('social publishing PostgreSQL integration', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.match(url.pathname, /^\/nexoclip_social_test_[a-z\d_]+$/);
  assert.equal(process.env.DATABASE_URL, process.env.TEST_DATABASE_URL);
  const pool = new pg.Pool({ connectionString: url.href });
  t.after(async () => { await pool.end(); await closePool(); });
  await t.test('all migrations run from an empty database and rerun without changes', async () => {
    await migrate(); await migrate();
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM schema_migrations WHERE filename='071_social_scheduling_drafts.sql'")).rows[0].count, 1);
  });
  const userId = randomUUID(), otherUser = randomUUID(), workspaceId = randomUUID(), otherWorkspace = randomUUID();
  const accountId = randomUUID(), generationId = randomUUID(), assetId = randomUUID(), photoId = randomUUID();
  await pool.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,\'test\'),($3,$4,\'test\')', [userId, `${userId}@example.test`, otherUser, `${otherUser}@example.test`]);
  await pool.query('INSERT INTO workspaces(id,name,slug) VALUES($1,\'Test\',$1::uuid::text),($2,\'Other\',$2::uuid::text)', [workspaceId, otherWorkspace]);
  await pool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'owner'),($3,$4,'owner')", [workspaceId, userId, otherWorkspace, otherUser]);
  await pool.query("INSERT INTO social_accounts(id,workspace_id,user_id,provider,provider_account_id,granted_scopes) VALUES($1,$2,$3,'tiktok','fake-account',ARRAY['video.upload','video.publish'])", [accountId, workspaceId, userId]);
  await pool.query("INSERT INTO assets(id,workspace_id,storage_key,filename,content_type,size_bytes) VALUES($1,$2,$1::uuid::text,'test.mp4','video/mp4',52),($3,$2,$3::uuid::text,'photo.jpg','image/jpeg',4)", [assetId, workspaceId, photoId]);
  await pool.query("INSERT INTO generation_jobs(id,workspace_id,created_by_user_id,kind,status,prompt,model) VALUES($1,$2,$3,'video','succeeded','test','test')", [generationId, workspaceId, userId]);
  await pool.query("INSERT INTO generation_outputs(workspace_id,generation_job_id,provider_request_id,output_index,asset_id) VALUES($1,$2,'fake-request',0,$3)", [workspaceId, generationId, assetId]);
  const owner = { workspaceId, userId }, other = { workspaceId: otherWorkspace, userId: otherUser };
  const input = { ...owner, accountId, generationId, mode: 'upload', confirm: true, idempotencyKey: 'same-request', scheduledAt: new Date(Date.now() + 3600000).toISOString(), timeZone: 'Asia/Jakarta' };
  let scheduled;
  await t.test('concurrent queue creation is idempotent and cross-tenant access is denied', async () => {
    const jobs = await Promise.all([createPublishJob(pool, input), createPublishJob(pool, input)]);
    assert.equal(jobs[0].id, jobs[1].id); scheduled = jobs[0]; assert.equal(scheduled.status, 'scheduled');
    assert.equal(await findSocialPublishJob(pool, { ...other, jobId: scheduled.id }), null);
    await assert.rejects(createPublishJob(pool, { ...input, ...other }), e => e.status === 404);
    await assert.rejects(actOnSocialPublishJob(pool, { ...other, jobId: scheduled.id, action: 'cancel' }), e => e.status === 404);
  });
  await t.test('future posts cannot be claimed and cancellation prevents later submission', async () => {
    const noCall = () => assert.fail('Future or cancelled jobs must not execute');
    await executePublishJob(pool, {}, scheduled.id, {}, noCall, noCall);
    assert.equal((await findSocialPublishJob(pool, { ...owner, jobId: scheduled.id })).status, 'scheduled');
    await actOnSocialPublishJob(pool, { ...owner, jobId: scheduled.id, action: 'reschedule', scheduledAt: new Date(Date.now() + 7200000).toISOString(), timeZone: 'Asia/Jakarta' });
    assert.equal((await actOnSocialPublishJob(pool, { ...owner, jobId: scheduled.id, action: 'cancel' })).status, 'cancelled');
    await executePublishJob(pool, {}, scheduled.id, {}, noCall, noCall);
  });
  await t.test('two workers racing for the same job produce exactly one execution', async () => {
    const job = await createPublishJob(pool, { ...input, scheduledAt: null, idempotencyKey: 'race-workers' });
    let count = 0;
    const getToken = async () => { count++; await new Promise(resolve => setTimeout(resolve, 20)); throw Object.assign(new Error('Test stops before TikTok'), { status: 400 }); };
    await Promise.all([executePublishJob(pool, {}, job.id, {}, () => assert.fail('No TikTok'), getToken), executePublishJob(pool, {}, job.id, {}, () => assert.fail('No TikTok'), getToken)]);
    assert.equal(count, 1); assert.equal((await findSocialPublishJob(pool, { ...owner, jobId: job.id })).status, 'failed');
  });
  await t.test('persisted drafts survive reload, preserve ownership and reject stale edits', async () => {
    const content = { mediaType: 'video', generationId, mode: 'upload', accountId, caption: 'Saved', photoCoverIndex: 0,
      disableComment: true, disableDuet: true, disableStitch: true, brandContentToggle: false, brandOrganicToggle: false,
      autoAddMusic: false, isAigc: true, scheduleEnabled: false, confirm: true };
    const draft = await saveSocialPublishDraft(pool, owner, { content });
    const reloaded = await getSocialPublishDraft(pool, owner, draft.id);
    assert.equal(reloaded.content.caption, 'Saved'); assert.equal('confirm' in reloaded.content, false); assert.equal(reloaded.video.asset_id, assetId);
    await assert.rejects(getSocialPublishDraft(pool, other, draft.id), e => e.status === 404);
    const edited = await saveSocialPublishDraft(pool, owner, { id: draft.id, version: draft.version, content: { ...content, caption: 'Edited' } });
    await assert.rejects(saveSocialPublishDraft(pool, owner, { id: draft.id, version: draft.version, content }), e => e.status === 409);
    await assert.rejects(deleteSocialPublishDraft(pool, other, edited.id, edited.version), e => e.status === 409);
    await deleteSocialPublishDraft(pool, owner, edited.id, edited.version);
  });
  await t.test('photo schedules preserve ordered assets and cannot reuse an idempotency key for a different time', async () => {
    const env = { TIKTOK_ENV: 'sandbox', R2_PUBLIC_URL: 'https://assets.example.test', R2_BUCKET: 'fake', R2_ACCOUNT_ID: 'fake', R2_ACCESS_KEY_ID: 'fake', R2_SECRET_ACCESS_KEY: 'fake', TIKTOK_VERIFIED_MEDIA_DOMAINS: 'example.test' };
    const photo = { ...input, assetIds: [photoId], idempotencyKey: 'photo-schedule' };
    const job = await createPhotoPublishJob(pool, photo, env);
    assert.equal(job.status, 'scheduled');
    const rows = await pool.query('SELECT asset_id,position FROM social_publish_media WHERE social_publish_job_id=$1', [job.id]);
    assert.deepEqual(rows.rows, [{ asset_id: photoId, position: 0 }]);
    await assert.rejects(createPhotoPublishJob(pool, { ...photo, scheduledAt: new Date(Date.now() + 7200000).toISOString() }, env), e => e.status === 409);
  });
  await t.test('manual review status check persists through the timestamp lease without exposing credentials', async () => {
    const job = await createPublishJob(pool, { ...input, scheduledAt: null, idempotencyKey: 'review-check' });
    await pool.query("UPDATE social_publish_jobs SET status='needs_review',provider_publish_id='fake-publish-id',next_poll_at=NULL WHERE id=$1", [job.id]);
    const checked = await actOnSocialPublishJob(pool, { ...owner, jobId: job.id, action: 'check' }, {
      getToken: async () => 'fake-access', fetcher: async () => new Response(JSON.stringify({ data: { status: 'PUBLISH_COMPLETE' }, error: { code: 'ok' } })),
    });
    assert.equal(checked.status, 'published');
    for (const field of ['upload_url_encrypted','provider_publish_id','access_token']) assert.equal(field in checked, false);
  });
  await t.test('review checks keep a cooldown and a concurrent terminal webhook wins', async () => {
    const job = await createPublishJob(pool, { ...input, scheduledAt: null, idempotencyKey: 'review-race' });
    await pool.query("UPDATE social_publish_jobs SET status='needs_review',provider_publish_id='fake-review',upload_url_encrypted='fake-encrypted',next_poll_at=NULL WHERE id=$1", [job.id]);
    const options = { getToken: async () => 'fake-access', fetcher: async () => new Response(JSON.stringify({ data: { status: 'PROCESSING_UPLOAD' }, error: { code: 'ok' } })) };
    assert.equal((await actOnSocialPublishJob(pool, { ...owner, jobId: job.id, action: 'check' }, options)).status, 'needs_review');
    await assert.rejects(actOnSocialPublishJob(pool, { ...owner, jobId: job.id, action: 'check' }, { getToken: () => assert.fail('Cooldown must block API access') }), e => e.status === 409);
    await pool.query("UPDATE social_publish_jobs SET next_poll_at=now()-interval '1 minute' WHERE id=$1", [job.id]);
    assert.equal((await actOnSocialPublishJob(pool, { ...owner, jobId: job.id, action: 'resume' }, options)).status, 'queued');
    await pool.query("UPDATE social_publish_jobs SET status='needs_review',next_poll_at=NULL WHERE id=$1", [job.id]);
    const checked = await actOnSocialPublishJob(pool, { ...owner, jobId: job.id, action: 'check' }, {
      getToken: async () => 'fake-access', fetcher: async () => {
        await pool.query("UPDATE social_publish_jobs SET status='published',next_poll_at=NULL WHERE id=$1", [job.id]);
        return new Response(JSON.stringify({ data: { status: 'FAILED' }, error: { code: 'ok' } }));
      },
    });
    assert.equal(checked.status, 'published');
  });
});
