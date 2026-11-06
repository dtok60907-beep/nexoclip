# NexoClip Social

Entry point: `/studio/social`. Users sign in to NexoClip. Postiz runs as a separate service; there is no second user-facing Postiz login and no shared organization across workspaces.

## Current scope

- LinkedIn profiles: connect with OAuth, text/image/video drafts, schedule, list recent/upcoming posts, cancel queued posts.
- Workspace members can read; owners/admins can connect and publish. Read-only impersonation cannot mutate anything.
- Media must be an image/video asset owned by the workspace, on HTTPS object storage, at most 100 MB. Postiz imports it before scheduling, so expiring NexoClip download URLs are not stored in scheduled posts.
- Postiz handles durable delivery with Temporal. NexoClip only performs short API calls.
- Other social networks, LinkedIn company-page selection, analytics, editing saved drafts, and bulk scheduling are not included in this first composer.

## Railway deployment

Project: `nexoclip-production` (`bc4d5cda-9f98-468a-8f2b-439136e796a1`), production environment.

| Service | ID | Configuration |
| --- | --- | --- |
| postiz | `6396b3cb-f936-4de1-8dc6-d03f278092b8` | Official `ghcr.io/gitroomhq/postiz-app` image; persistent `/uploads` |
| postiz-db | `b7785b15-a86e-4fbb-845a-52f9c2dcd6b8` | PostgreSQL 17; separate databases `postiz`, `temporal`, `temporal_visibility`; persistent volume |
| postiz-redis | `b3451e68-92d9-4248-b5cc-af471e36db67` | Redis 7.4; password required; AOF persistence |
| postiz-temporal | `74324fce-23fb-45a1-9297-45728498c88a` | Temporal 1.29.1; SQL visibility; namespace `nexoclip-social` |

Postiz gateway: `https://postiz-production-6be7.up.railway.app` (port 5000). Backend listens on port 3000; do not set its `PORT` to 5000, which is occupied by nginx. Database, Redis and Temporal have no public domains/TCP proxies.

Postiz registration is disabled. OAuth platform credentials are configured on **postiz**, not in the browser or the NexoClip app.

Temporal uses `SKIP_ADD_CUSTOM_SEARCH_ATTRIBUTES=true`, `DEFAULT_NAMESPACE=nexoclip-social`, and `ENABLE_ES=false`. Its example Text attributes otherwise exhaust SQL visibility's three Text slots before Postiz registers `organizationId` and `postId`. `TEMPORAL_BROADCAST_ADDRESS=127.0.0.1` is for this single-node Temporal deployment; do not scale replicas without configuring cluster networking.

The NexoClip app uses:

```dotenv
POSTIZ_API_URL=http://${{postiz.RAILWAY_PRIVATE_DOMAIN}}:3000
POSTIZ_JWT_SECRET=${{postiz.JWT_SECRET}}
POSTIZ_LINKEDIN_ENABLED=false
```

`POSTIZ_JWT_SECRET` also derives a separate AES-GCM encryption key for stored workspace API credentials. **Do not rotate it without re-encrypting existing credentials with the old and new keys.** Never expose it as a `NEXT_PUBLIC_` variable. Keep it in Railway, outside git.

The app's existing pre-deploy migration runs `065_social_publishing.sql`. No Postiz tables are installed in NexoClip's database. Runtime integration uses documented HTTP endpoints; no Postiz code is copied into this repository.

## Enable LinkedIn

1. Create/configure the NexoClip app in LinkedIn Developers and enable the products/scopes required by Postiz's LinkedIn provider.
2. Set the authorized redirect URL to `https://postiz-production-6be7.up.railway.app/integrations/social/linkedin`.
3. Enter `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` in the **postiz** service variables. Do not put credentials in chat or git.
4. Set `POSTIZ_LINKEDIN_ENABLED=true` on **ai-ugc-app** after Postiz has redeployed.
5. Open `/studio/social`, activate a workspace, and connect LinkedIn. The consent screen returns to NexoClip.
6. Save a draft and schedule a harmless test post using a consenting operator-owned account. Verify delivery and cancellation in Temporal before announcing general availability.

No real social messages are sent by automated tests. Actual OAuth and delivery need platform credentials and an account owner's consent.

## Reconciliation

The upstream create-user and create-post APIs do not provide an idempotency token. NexoClip claims a durable row before either request; a timeout is **not automatically retried**. The browser must refresh the list before the operator decides whether another submission is appropriate.

- `social_workspaces.status=provisioning/needs_review`: inspect the Postiz organization named `NexoClip workspace###<workspace UUID>` and synthetic email `workspace-<UUID>+nexoclip@nexoclip.invalid`. If the upstream organization exists, recover its API key server-side and encrypt it using `encryptApiKey(key, workspaceId)` before marking the mapping ready. Do not delete/recreate blindly.
- `social_submissions.status=submitting/needs_review`: inspect the workspace's Postiz posts and workflow history first. If accepted, reconcile the receipt; only allow a fresh submission after verifying that no post was created.
- A `ready` mapping stores the Postiz organization ID and encrypted key. Only allowlisted display fields are returned to clients.

## Verification

```sh
node tests/social/social.test.mjs
node tests/social/route.test.mjs
git diff --check
```

These cover credential binding, authorization, CSRF, concurrent activation, duplicate submission, unknown outcomes, cross-workspace channels/assets, and cancellation ownership. Migration/repository SQL was also exercised against an empty PostgreSQL schema inside a rolled-back transaction. UI browser checks use mocked APIs, not live social accounts.

References: [Postiz Public API](https://docs.postiz.com/public-api/introduction), [LinkedIn setup](https://docs.postiz.com/providers/linkedin), [Temporal auto-setup options](https://github.com/temporalio/docker-builds/blob/main/docker-readme/auto-setup.md).
