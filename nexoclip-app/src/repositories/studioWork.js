const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid = () => Object.assign(new Error('Project studio tidak valid.'), { status: 400 });

export async function saveStudioWork(db, workspace, owner, work, job) {
  if (
    !uuid.test(work?.id) ||
    !['image', 'video', 'cinema', 'ai-influencer'].includes(work.studio) ||
    (work.studio === 'video') !== (job.kind === 'video')
  )
    throw invalid();
  const settings = work.settings;
  if (
    !settings ||
    typeof settings !== 'object' ||
    Array.isArray(settings) ||
    JSON.stringify(settings).length > 24000
  )
    throw invalid();
  // Only simple editor controls are restored. Media stays on the generation and its assets.
  for (const [key, value] of Object.entries(settings)) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(key) || typeof value !== 'string' || value.length > 10000)
      throw invalid();
  }
  const result = await db.query(
    `INSERT INTO projects AS p(id,workspace_id,studio_owner,studio,name,slug,studio_settings)
    VALUES($1,$2,$3,$4,$5,$1::uuid::text,$6)
    ON CONFLICT(id) DO UPDATE SET studio_settings=excluded.studio_settings,updated_at=now()
    WHERE p.workspace_id=excluded.workspace_id AND p.studio_owner=excluded.studio_owner AND p.studio=excluded.studio
    RETURNING id`,
    [work.id, workspace, owner, work.studio, (settings.prompt || job.prompt).slice(0, 120), settings],
  );
  if (!result.rowCount) throw invalid();
  return result.rows[0].id;
}

export async function localCatalog(db, workspace, owner) {
  const scope = [workspace, owner];
  const projects = await db.query(
    `SELECT p.id,coalesce(p.studio,'workspace') studio,p.name,p.created_at,
      greatest(p.updated_at,j.updated_at) updated_at,j.status,o.asset_id,p.description,false legacy
    FROM projects p
    LEFT JOIN LATERAL (SELECT id,updated_at,status FROM generation_jobs WHERE workspace_id=p.workspace_id AND project_id=p.id
      AND created_by_user_id=$2 ORDER BY created_at DESC,id LIMIT 1) j ON true
    LEFT JOIN LATERAL (SELECT asset_id FROM generation_outputs WHERE workspace_id=p.workspace_id AND generation_job_id=j.id ORDER BY output_index LIMIT 1) o ON true
    WHERE p.workspace_id=$1 AND (p.studio IS NULL OR (p.studio_owner=$2 AND p.studio IN ('cinema','ai-influencer')))
    UNION ALL SELECT m.id,'motion',coalesce(nullif(m.doc#>>'{story,title}',''),m.name),m.created_at,greatest(m.updated_at,mj.updated_at),mj.status,
      (SELECT a.id FROM jsonb_each(CASE WHEN jsonb_typeof(m.doc#>'{story,assets}')='object' THEN m.doc#>'{story,assets}' ELSE '{}'::jsonb END) ref JOIN assets a
        ON a.workspace_id=m.workspace_id AND a.id::text=ref.value->>'assetId'
        WHERE ref.value->>'type'='image' ORDER BY ref.key LIMIT 1),NULL,(m.doc->>'kind' IS DISTINCT FROM 'story')
    FROM motion_projects m LEFT JOIN LATERAL (SELECT status,updated_at FROM motion_jobs
      WHERE workspace_id=m.workspace_id AND project_id=m.id ORDER BY created_at DESC LIMIT 1) mj ON true
    WHERE m.workspace_id=$1 AND m.created_by=$2`,
    scope,
  );
  const folders = await db.query(
    'SELECT id,name,updated_at FROM project_folders WHERE workspace_id=$1 AND owner_id=$2',
    scope,
  );
  const items = await db.query(
    'SELECT studio,source_id,folder_id FROM project_folder_items WHERE workspace_id=$1 AND owner_id=$2',
    scope,
  );
  return { projects: projects.rows, folders: folders.rows, items: items.rows };
}

export async function restoreWork(db, workspace, owner, id, studio) {
  const p = await db.query(
    'SELECT studio_settings FROM projects WHERE workspace_id=$1 AND studio_owner=$2 AND id=$3 AND studio=$4',
    [workspace, owner, id, studio],
  );
  if (!p.rowCount) throw Object.assign(new Error('Project tidak ditemukan.'), { status: 404 });
  const jobs = await db.query(
    `SELECT j.id,j.model,j.prompt,j.parameters,j.created_at,o.asset_id FROM generation_jobs j
    LEFT JOIN LATERAL (SELECT asset_id FROM generation_outputs WHERE workspace_id=j.workspace_id AND generation_job_id=j.id ORDER BY output_index LIMIT 1) o ON true
    WHERE j.workspace_id=$1 AND j.created_by_user_id=$2 AND j.project_id=$3 ORDER BY j.created_at DESC,j.id`,
    [workspace, owner, id],
  );
  return { settings: p.rows[0].studio_settings, jobs: jobs.rows };
}

export async function changeFolder(db, workspace, owner, body) {
  const { action, folderId, studio, id } = body;
  const name = typeof body.name === 'string' && body.name.trim();
  if (['create', 'rename'].includes(action) && (!name || name.length > 120)) throw invalid();
  if (action === 'create')
    return db.query('INSERT INTO project_folders(workspace_id,owner_id,name) VALUES($1,$2,$3)', [
      workspace,
      owner,
      name,
    ]);
  if (!(action === 'move' && folderId === null) && !uuid.test(folderId)) throw invalid();
  const scope = [workspace, owner, folderId];
  let result;
  if (action === 'rename')
    result = await db.query(
      'UPDATE project_folders SET name=$4,updated_at=now() WHERE workspace_id=$1 AND owner_id=$2 AND id=$3',
      [...scope, name],
    );
  else if (action === 'delete')
    result = await db.query(
      'DELETE FROM project_folders WHERE workspace_id=$1 AND owner_id=$2 AND id=$3',
      scope,
    );
  else if (action === 'move' && folderId === null)
    return db.query(
      'DELETE FROM project_folder_items WHERE workspace_id=$1 AND owner_id=$2 AND studio=$3 AND source_id=$4',
      [workspace, owner, studio, id],
    );
  else if (action === 'move')
    result = await db.query(
      `INSERT INTO project_folder_items(workspace_id,owner_id,folder_id,studio,source_id)
    SELECT workspace_id,owner_id,id,$4,$5 FROM project_folders WHERE workspace_id=$1 AND owner_id=$2 AND id=$3
    ON CONFLICT(workspace_id,owner_id,studio,source_id) DO UPDATE SET folder_id=excluded.folder_id`,
      [...scope, studio, id],
    );
  else throw invalid();
  if (!result.rowCount) throw Object.assign(new Error('Folder tidak ditemukan.'), { status: 404 });
}
