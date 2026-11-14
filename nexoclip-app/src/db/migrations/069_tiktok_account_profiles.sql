ALTER TABLE social_accounts
  ADD COLUMN profile_data JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN profile_synced_at TIMESTAMPTZ,
  ADD COLUMN profile_sync_error TEXT,
  ADD COLUMN profile_next_sync_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN profile_sync_lease_id UUID,
  ADD COLUMN profile_sync_lease_until TIMESTAMPTZ;
CREATE INDEX social_accounts_profile_due_idx ON social_accounts(profile_next_sync_at) WHERE status='connected';
