import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { filterLibrary } from '../../src/lib/projectLibraryFilters.js';
import {
  changeFolder,
  localCatalog,
  restoreWork,
  saveStudioWork,
} from '../../src/repositories/studioWork.js';
import { catalog } from '../../src/services/projectCatalog.js';

test('search includes folders and nested matches; studio, status and date combine', () => {
  const folders = [{ name: 'Kopi', id: 'f', updated_at: '2025-01-03' }];
  const project = { name: 'Kopi susu', studio: 'cinema', status: 'succeeded', folderId: 'f' };
  const first = { ...project, id: 'a', updated_at: '2025-01-01' };
  const second = { ...project, id: 'b', updated_at: '2025-01-02' };
  const data = { folders, projects: [first, second, { ...second, id: 'c', studio: 'canvas' }] };
  const filtered = filterLibrary(data, {
    folder: null,
    search: 'KOPI',
    studio: 'cinema',
    status: 'succeeded',
    order: 'newest',
  });
  assert.deepEqual(filtered, { folders, projects: [second, first] });
  assert.deepEqual(
    filterLibrary(data, { folder: 'f', search: '', studio: 'cinema', order: 'oldest' }).projects,
    [first, second],
  );
  assert.deepEqual(filterLibrary(data, { folder: null, search: '' }).projects, []);
});

test(
  'native sources, restore, retries, mixed folders and tenant isolation',
  { skip: !process.env.PROJECT_LIBRARY_TEST_DATABASE },
  async (t) => {
    const { Client } = await import('pg');
    const db = new Client({ connectionString: process.env.PROJECT_LIBRARY_TEST_DATABASE });
    await db.connect();
    await db.query('BEGIN');
    t.after(async () => {
      await db.query('ROLLBACK');
      await db.end();
    });
    const owner = randomUUID(),
      other = randomUUID(),
      workspace = randomUUID(),
      foreign = randomUUID();
    for (const id of [owner, other])
      await db.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test')", [
        id,
        id + '@example.test',
      ]);
    for (const [id, user] of [
      [workspace, owner],
      [foreign, other],
    ]) {
      await db.query("INSERT INTO workspaces(id,name,slug) VALUES($1,'test',$2)", [id, id]);
      await db.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')", [
        id,
        user,
      ]);
    }
    const work = { id: randomUUID(), studio: 'cinema', settings: { prompt: 'Teh', focal: '35' } };
    const job = { kind: 'image', prompt: 'Teh' };
    await saveStudioWork(db, workspace, owner, work, job);
    await saveStudioWork(db, workspace, owner, work, job);
    await assert.rejects(saveStudioWork(db, foreign, other, work, job), /tidak valid/);
    await assert.rejects(restoreWork(db, workspace, other, work.id, work.studio), /tidak ditemukan/);
    await assert.rejects(restoreWork(db, foreign, owner, work.id, work.studio), /tidak ditemukan/);
    assert.deepEqual((await restoreWork(db, workspace, owner, work.id, work.studio)).settings, work.settings);
    for (const [studio, kind] of [
      ['video', 'video'],
      ['ai-influencer', 'image'],
    ]) {
      await saveStudioWork(db, workspace, owner, { ...work, id: randomUUID(), studio }, { ...job, kind });
    }
    const motionId = randomUUID();
    await db.query(
      "INSERT INTO motion_projects(id,workspace_id,created_by,name,doc) VALUES($1,$2,$3,'Motion',$4)",
      [motionId, workspace, owner, { kind: 'story', story: { title: 'Storyboard' } }],
    );
    for (const prompt of ['Teh', 'Revisi']) {
      await db.query(
        "INSERT INTO generation_jobs(workspace_id,created_by_user_id,project_id,kind,prompt,model) VALUES($1,$2,$3,'image',$4,'test')",
        [workspace, owner, work.id, prompt],
      );
    }
    assert.equal((await restoreWork(db, workspace, owner, work.id, 'cinema')).jobs.length, 2);
    const canvas = {
      id: randomUUID(),
      name: 'Canvas lama',
      origin: 'canvas',
      createdat: '2025-01-01',
      updatedat: '2025-01-02',
    };
    const native = [canvas, { ...canvas, id: randomUUID(), library_workspace_id: foreign }];
    t.mock.method(globalThis, 'fetch', async (url, opts) => {
      if (String(url).includes('/canvas/')) {
        assert.ok(opts.headers.cookie.includes('fixture'));
        return Response.json(native);
      }
      assert.equal(opts.headers['X-Nexoclip-User-Id'], owner);
      return Response.json([
        { project_id: 'director-local', title: 'Brief', library_workspace_id: workspace },
      ]);
    });
    const old = process.env.DIRECTOR_SERVICE_URL;
    process.env.DIRECTOR_SERVICE_URL = 'http://studio.test';
    t.after(() => {
      if (old) process.env.DIRECTOR_SERVICE_URL = old;
      else delete process.env.DIRECTOR_SERVICE_URL;
    });
    const list = () => catalog(db, workspace, owner, { cookies: { get: () => ({ value: 'fixture' }) } });
    let library = await list();
    assert.deepEqual(library.projects.map((p) => p.studio).sort(), [
      'ai-influencer',
      'canvas',
      'cinema',
      'director',
      'motion',
    ]);
    assert.equal(
      library.projects.find((p) => p.studio === 'motion').href,
      '/studio/motion?project=' + motionId,
    );
    assert.equal(library.projects.find((p) => p.studio === 'canvas').href, '/canvas/project/' + canvas.id);
    const newer = { ...canvas, id: randomUUID(), name: 'Canvas baru', library_workspace_id: workspace };
    native.push(newer);
    await changeFolder(db, workspace, owner, { action: 'create', name: 'Iklan' });
    const folderId = (await list()).folders[0].id;
    for (const p of [work, { studio: 'canvas', id: newer.id }]) {
      await changeFolder(db, workspace, owner, { action: 'move', folderId, studio: p.studio, id: p.id });
    }
    newer.name = 'Rename';
    newer.thumbnail = '/canvas/preview.png';
    library = await list();
    assert.equal(library.projects.filter((p) => p.folderId === folderId).length, 2);
    assert.equal(library.projects.find((p) => p.name === 'Rename').thumbnail, newer.thumbnail);
    await assert.rejects(changeFolder(db, foreign, other, { action: 'delete', folderId }), /tidak ditemukan/);
    await changeFolder(db, workspace, owner, { action: 'rename', folderId, name: 'Kampanye' });
    await changeFolder(db, workspace, owner, { action: 'delete', folderId });
    assert.equal((await list()).projects.filter((p) => p.folderId).length, 0);
    assert.equal((await localCatalog(db, workspace, owner)).projects.length, 3);
    native.pop();
    assert.equal(
      (await list()).projects.some((p) => p.id === newer.id),
      false,
    );
  },
);
