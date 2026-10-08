-- Global account access; credits and workspace memberships are unchanged.
ALTER TABLE users ADD COLUMN suspended_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN access_version BIGINT NOT NULL DEFAULT 0 CHECK (access_version >= 0);
CREATE TABLE account_access_events (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 request_key UUID NOT NULL,
 action TEXT NOT NULL CHECK (action IN ('suspend','activate','revoke_sessions')),
 reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 500),
 previous_version BIGINT NOT NULL CHECK (previous_version >= 0),
 new_version BIGINT NOT NULL CHECK (new_version = previous_version + 1),
 suspended_at TIMESTAMPTZ,
 revoked_sessions INTEGER NOT NULL CHECK (revoked_sessions >= 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(actor_user_id,request_key)
);
CREATE INDEX account_access_events_target_idx ON account_access_events(target_user_id,id DESC);
CREATE FUNCTION protect_account_access_events() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Account access history is append-only'; END $$;
CREATE TRIGGER account_access_events_immutable BEFORE UPDATE OR DELETE ON account_access_events
 FOR EACH ROW EXECUTE FUNCTION protect_account_access_events();
-- Serialize all session creation paths (password, OAuth, registration, scripts)
-- with suspension/revocation. NO KEY UPDATE permits unrelated FK log inserts.
CREATE FUNCTION require_active_account_session() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE suspended TIMESTAMPTZ;
BEGIN
 SELECT suspended_at INTO suspended FROM users WHERE id=NEW.user_id FOR NO KEY UPDATE;
 IF NOT FOUND OR suspended IS NOT NULL THEN
   RAISE EXCEPTION 'Account access unavailable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sessions_require_active_account BEFORE INSERT ON sessions
 FOR EACH ROW EXECUTE FUNCTION require_active_account_session();
