ALTER TABLE projects ADD COLUMN studio text CHECK (studio IN ('video','cinema','ai-influencer')),
  ADD COLUMN studio_owner uuid REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN studio_settings jsonb,
  ADD CHECK ((studio IS NULL) = (studio_owner IS NULL));

CREATE INDEX generation_jobs_project_recent ON generation_jobs(workspace_id,project_id,created_at DESC) WHERE project_id IS NOT NULL;
CREATE TABLE project_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,owner_id,id)
);
CREATE TABLE project_folder_items (
  workspace_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  studio text NOT NULL,
  source_id text NOT NULL,
  folder_id uuid NOT NULL,
  PRIMARY KEY(workspace_id,owner_id,studio,source_id),
  FOREIGN KEY(workspace_id,owner_id,folder_id) REFERENCES project_folders(workspace_id,owner_id,id) ON DELETE CASCADE
);

-- Historical Studio jobs used a random request UUID, while Canvas and Director
-- used namespaced keys. Keep unidentified images in their original history.
CREATE TEMP TABLE legacy_studio_jobs ON COMMIT DROP AS
SELECT id, workspace_id, created_by_user_id, created_at, updated_at, prompt, model, parameters,
  CASE
    WHEN kind='video' AND model <> 'byteplus/seedance-2.5-unfiltered' THEN 'video'
    WHEN kind='image' AND model='bytedance-seed/seedream-4.5'
      AND prompt LIKE '%, shot on a %, using a %mm %, aperture %, %cinematic lighting, natural color science, high dynamic range, professional photography, ultra-detailed, 8K resolution' THEN 'cinema'
    WHEN kind='image' AND model='google/gemini-3-pro-image'
      AND prompt LIKE 'Ultra-realistic professional portrait photograph of an AI influencer character, 8k resolution, cinematic lighting, sharp detail%' THEN 'ai-influencer'
  END AS studio
FROM generation_jobs WHERE project_id IS NULL AND created_by_user_id IS NOT NULL
  AND idempotency_key ~* '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$';

WITH latest AS (
  SELECT DISTINCT ON(workspace_id,created_by_user_id,studio) *,gen_random_uuid() project,
    min(created_at) OVER (PARTITION BY workspace_id,created_by_user_id,studio) first_created
  FROM legacy_studio_jobs WHERE studio IS NOT NULL
  ORDER BY workspace_id,created_by_user_id,studio,created_at DESC,id
), inserted AS (
  INSERT INTO projects(id,workspace_id,studio_owner,studio,slug,name,created_at,updated_at,studio_settings)
  SELECT project,workspace_id,created_by_user_id,studio,project::text,
    'Riwayat ' || CASE studio WHEN 'video' THEN 'Video Studio' WHEN 'cinema' THEN 'Cinema' ELSE 'AI Influencer' END,
    first_created,updated_at,jsonb_build_object('prompt',CASE studio WHEN 'cinema' THEN split_part(prompt,', shot on a ',1)
      WHEN 'ai-influencer' THEN ltrim(substr(prompt,length('Ultra-realistic professional portrait photograph of an AI influencer character, 8k resolution, cinematic lighting, sharp detail')+1),', ')
      ELSE prompt END) FROM latest
  RETURNING id,workspace_id,studio_owner,studio
)
UPDATE generation_jobs j SET project_id=p.id FROM legacy_studio_jobs l JOIN inserted p
  ON (l.workspace_id,l.created_by_user_id,l.studio)=(p.workspace_id,p.studio_owner,p.studio)
WHERE j.id=l.id AND j.project_id IS NULL;
