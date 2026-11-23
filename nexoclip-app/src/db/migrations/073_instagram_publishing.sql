ALTER TABLE social_posts DROP CONSTRAINT social_posts_provider_check;
ALTER TABLE social_posts ADD CONSTRAINT social_posts_provider_check CHECK(provider IN ('tiktok','instagram'));
ALTER TABLE social_posts ADD COLUMN media_details JSONB NOT NULL DEFAULT '{}';
ALTER TABLE social_accounts ADD COLUMN instagram_sync_cursor TEXT;
ALTER TABLE social_publish_jobs DROP CONSTRAINT social_publish_jobs_provider_check;
ALTER TABLE social_publish_jobs ADD CONSTRAINT social_publish_jobs_provider_check CHECK(provider IN ('tiktok','instagram'));
ALTER TABLE social_publish_jobs ADD COLUMN provider_state JSONB NOT NULL DEFAULT '{}';
ALTER TABLE social_publish_jobs ADD CONSTRAINT instagram_direct_only CHECK(provider<>'instagram' OR mode='direct');
