-- Marketing Routines (scheduled recurring agent tasks) and Human-in-the-Loop Approval Cards.

CREATE TABLE IF NOT EXISTS marketing_routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  cadence TEXT NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('daily', 'weekdays', 'weekly', 'manual')),
  schedule_label TEXT NOT NULL DEFAULT 'Every Monday · 09:00',
  require_approval BOOLEAN NOT NULL DEFAULT TRUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  last_thread_id UUID REFERENCES marketing_threads(id) ON DELETE SET NULL,
  last_status TEXT NOT NULL DEFAULT 'idle' CHECK (last_status IN ('idle', 'running', 'succeeded', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_routines_workspace_idx
  ON marketing_routines(workspace_id, enabled, updated_at DESC);

CREATE TABLE IF NOT EXISTS marketing_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES marketing_threads(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'generate_keyframe',
    'generate_voiceover',
    'generate_music',
    'generate_video',
    'launch_meta_campaign',
    'update_brand'
  )),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  estimated_credits INTEGER NOT NULL DEFAULT 0,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'approved',
    'executing',
    'completed',
    'rejected',
    'failed'
  )),
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_approvals_workspace_idx
  ON marketing_approvals(workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS marketing_approvals_thread_idx
  ON marketing_approvals(thread_id, created_at DESC);
