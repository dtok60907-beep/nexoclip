-- AI Creative Marketing: persistent threads, campaigns, artifacts, deliverables, brand memories, and research cache.

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  product_ids UUID[] NOT NULL DEFAULT '{}',
  platforms TEXT[] NOT NULL DEFAULT '{}',
  duration_days INTEGER NOT NULL DEFAULT 7,
  start_date DATE,
  end_date DATE,
  budget_credits_limit INTEGER,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_campaigns_workspace_idx
  ON marketing_campaigns(workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS marketing_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Marketing Session',
  mode TEXT NOT NULL DEFAULT 'agent' CHECK (mode IN ('copilot', 'agent', 'autopilot')),
  brand_context_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  selected_product_ids UUID[] NOT NULL DEFAULT '{}',
  linked_campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  messages_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  activity_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_threads_workspace_idx
  ON marketing_threads(workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS marketing_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES marketing_threads(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN (
    'research_report',
    'creative_strategy',
    'content_calendar',
    'script_pack',
    'performance_report'
  )),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_artifacts_workspace_idx
  ON marketing_artifacts(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS marketing_artifacts_campaign_idx
  ON marketing_artifacts(campaign_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS marketing_artifacts_thread_idx
  ON marketing_artifacts(thread_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS marketing_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  day_index INTEGER NOT NULL DEFAULT 1,
  scheduled_at TIMESTAMPTZ,
  title TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'tiktok',
  format TEXT NOT NULL DEFAULT 'ugc_video',
  hook TEXT NOT NULL DEFAULT '',
  angle TEXT NOT NULL DEFAULT '',
  cta TEXT NOT NULL DEFAULT '',
  script_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'idea' CHECK (status IN (
    'idea',
    'scripted',
    'producing',
    'ready',
    'scheduled',
    'published'
  )),
  canvas_project_id TEXT,
  linked_asset_ids TEXT[] NOT NULL DEFAULT '{}',
  linked_generation_ids TEXT[] NOT NULL DEFAULT '{}',
  linked_publish_job_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_deliverables_campaign_idx
  ON marketing_deliverables(campaign_id, day_index ASC, created_at ASC);

CREATE TABLE IF NOT EXISTS brand_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN (
    'preference',
    'creative_history',
    'feedback',
    'performance',
    'audience_insight'
  )),
  content TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'agent',
  source_id TEXT,
  confidence REAL NOT NULL DEFAULT 0.85,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brand_memories_workspace_idx
  ON brand_memories(workspace_id, active, updated_at DESC);

CREATE TABLE IF NOT EXISTS research_cache (
  cache_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'scrapeatlas',
  endpoint TEXT NOT NULL,
  params_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_json JSONB NOT NULL,
  credits_used INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS research_cache_expires_idx
  ON research_cache(expires_at);
