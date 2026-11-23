CREATE TABLE workspace_invitations (
 token_hash bytea PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE,
 email text NOT NULL, role text NOT NULL CHECK(role IN ('member','admin')),
 inviter uuid NOT NULL REFERENCES users ON DELETE CASCADE, expires_at timestamptz NOT NULL,
 UNIQUE(workspace_id,email)
);
