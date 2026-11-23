import { localCatalog } from '../repositories/studioWork.js';
import { SESSION_COOKIE } from '../lib/auth/session.js';

async function nativeProjects(studio, owner, request, workspace, legacyWorkspace) {
  let url, headers;
  if (studio === 'canvas') {
    url = new URL('/canvas/api/projects', process.env.SPITE_INTERNAL_URL || 'http://spite:3005').href;
    headers = {
      cookie: SESSION_COOKIE + '=' + encodeURIComponent(request.cookies.get(SESSION_COOKIE).value),
    };
  } else {
    if (!process.env.DIRECTOR_SERVICE_URL) throw new Error('Director unavailable');
    url = process.env.DIRECTOR_SERVICE_URL.replace(/\/$/, '') + '/api/director/projects';
    headers = {
      'X-Nexoclip-User-Id': owner,
      'X-Director-Proxy-Secret': process.env.DIRECTOR_PROXY_SECRET || '',
    };
  }
  const response = await fetch(url, {
    headers,
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('Studio unavailable');
  return (await response.json())
    .filter((p) => (p.library_workspace_id || legacyWorkspace) === workspace)
    .map((p) =>
      studio === 'canvas'
        ? {
            studio,
            id: p.id,
            name: p.name,
            created_at: p.createdat,
            updated_at: p.updatedat,
            thumbnail: p.thumbnail,
            href:
              '/canvas/' +
              (p.origin === 'canvas' || !p.origin ? '' : 'm/') +
              'project/' +
              encodeURIComponent(p.id),
          }
        : {
            studio,
            id: p.project_id,
            name: p.title,
            thumbnail: p.thumbnail_asset
              ? '/api/assets/' +
                encodeURIComponent(p.thumbnail_asset) +
                '/download?workspace_id=' +
                workspace +
                '&variant=thumb'
              : null,
            created_at: p.created_at,
            updated_at: p.updated_at || p.created_at,
            status: p.busy ? 'running' : p.needs_approval ? 'needs_approval' : 'idle',
            href: '/studio/director?project=' + encodeURIComponent(p.project_id),
          },
    );
}

export async function catalog(db, workspace, owner, request) {
  const { projects, folders, items } = await localCatalog(db, workspace, owner);
  // Legacy owner-only projects belong in the owner's earliest workspace.
  const home = await db.query(
    "SELECT workspace_id FROM workspace_memberships WHERE user_id=$1 ORDER BY (role='owner') DESC,created_at,id LIMIT 1",
    [owner],
  );
  const external = ['canvas', 'director'];
  const result = await Promise.allSettled(
    external.map((studio) => nativeProjects(studio, owner, request, workspace, home.rows[0]?.workspace_id)),
  );
  const unavailable = [];
  for (const p of projects) {
    p.href =
      p.studio === 'workspace'
        ? null
        : '/studio/' + p.studio + '?project=' + encodeURIComponent(p.id) + (p.legacy ? '&editor=legacy' : '');
    if (p.asset_id) p.thumbnail = '/api/assets/' + p.asset_id + '/download?workspace_id=' + workspace + (p.studio === 'video' ? '' : '&variant=thumb');
  }
  result.forEach((item, i) => {
    if (item.status === 'fulfilled') projects.push(...item.value);
    else unavailable.push(external[i]);
  });
  const byId = new Map(items.map((i) => [i.studio + '/' + i.source_id, i.folder_id]));
  for (const p of projects) p.folderId = byId.get(p.studio + '/' + p.id) || null;
  return { projects, folders, unavailable };
}
