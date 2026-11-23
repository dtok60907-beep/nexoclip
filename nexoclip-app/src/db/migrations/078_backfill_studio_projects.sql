ALTER TABLE projects DROP CONSTRAINT projects_studio_check;
ALTER TABLE projects ADD CONSTRAINT projects_studio_check
  CHECK (studio IN ('image','video','cinema','ai-influencer'));

-- Backfill only standalone studio generations. Director jobs use namespaced keys
-- and remain attached to Director's own project store.
CREATE TEMP TABLE unlinked_studio_jobs ON COMMIT DROP AS
SELECT id, workspace_id, created_by_user_id, created_at, updated_at, prompt, model, parameters,
  CASE
    WHEN kind='video' THEN 'video'
    WHEN kind='image' AND model='bytedance-seed/seedream-4.5'
      AND prompt LIKE '%, shot on a %, using a %mm %, aperture %, %cinematic lighting, natural color science, high dynamic range, professional photography, ultra-detailed, 8K resolution' THEN 'cinema'
    WHEN kind='image' AND model='google/gemini-3-pro-image'
      AND prompt LIKE 'Ultra-realistic professional portrait photograph of an AI influencer character, 8k resolution, cinematic lighting, sharp detail%' THEN 'ai-influencer'
    WHEN kind='image' THEN 'image'
  END AS studio
FROM generation_jobs
WHERE project_id IS NULL AND created_by_user_id IS NOT NULL
  AND idempotency_key ~* '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$';

CREATE TEMP TABLE studio_project_map (
  workspace_id uuid, studio_owner uuid, studio text, project_id uuid,
  PRIMARY KEY (workspace_id, studio_owner, studio)
) ON COMMIT DROP;

INSERT INTO studio_project_map
SELECT DISTINCT ON (g.workspace_id,g.created_by_user_id,g.studio)
  g.workspace_id,g.created_by_user_id,g.studio,p.id
FROM unlinked_studio_jobs g
JOIN projects p ON p.workspace_id=g.workspace_id AND p.studio_owner=g.created_by_user_id AND p.studio=g.studio
ORDER BY g.workspace_id,g.created_by_user_id,g.studio,p.created_at,p.id;

WITH work_groups AS (
  SELECT workspace_id,created_by_user_id,studio,min(created_at) created_at,max(updated_at) updated_at
  FROM unlinked_studio_jobs GROUP BY workspace_id,created_by_user_id,studio
), latest AS (
  SELECT DISTINCT ON (workspace_id,created_by_user_id,studio)
    workspace_id,created_by_user_id,studio,prompt
  FROM unlinked_studio_jobs ORDER BY workspace_id,created_by_user_id,studio,created_at DESC,id
), inserted AS (
  INSERT INTO projects(id,workspace_id,studio_owner,studio,slug,name,created_at,updated_at,studio_settings)
  SELECT gen_random_uuid(),g.workspace_id,g.created_by_user_id,g.studio,gen_random_uuid()::text,
    'Riwayat ' || CASE g.studio WHEN 'image' THEN 'Image Studio' WHEN 'video' THEN 'Video Studio'
      WHEN 'cinema' THEN 'Cinema' ELSE 'AI Influencer' END,
    g.created_at,g.updated_at,jsonb_build_object('prompt',l.prompt)
  FROM work_groups g JOIN latest l USING (workspace_id,created_by_user_id,studio)
  LEFT JOIN studio_project_map m ON (m.workspace_id,m.studio_owner,m.studio)=(g.workspace_id,g.created_by_user_id,g.studio)
  WHERE m.project_id IS NULL
  RETURNING workspace_id,studio_owner,studio,id
)
INSERT INTO studio_project_map
SELECT workspace_id,studio_owner,studio,id FROM inserted;

UPDATE generation_jobs j SET project_id=m.project_id
FROM unlinked_studio_jobs g
JOIN studio_project_map m ON (m.workspace_id,m.studio_owner,m.studio)=(g.workspace_id,g.created_by_user_id,g.studio)
WHERE j.id=g.id AND j.project_id IS NULL;
