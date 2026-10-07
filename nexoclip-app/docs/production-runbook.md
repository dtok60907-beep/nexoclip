# NexoClip production runbook (Compose + split databases)

This runbook defines the **production deployment contract** for `docker-compose.prod.yml` and `scripts/deploy.sh`.

### Billing environment preflight

Before production deployment, run `NODE_ENV=production npm run config:check` with the production environment loaded. `NEXOCLIP_ENVIRONMENT` must explicitly be `production`. When BytePlus credentials are enabled, both `BYTEPLUS_BILLING_ACCOUNT_ID` and `BYTEPLUS_PRODUCTION_BILLING_ACCOUNT_ID` must contain the same verified numeric provider account ID. Verify ownership in the provider console; the check validates configuration consistency, not API-key ownership remotely.

The production Compose web, image-worker and video-worker services pass these settings. Workers reject missing or mismatched production BytePlus account IDs before connecting to Redis or starting work. Local development may leave its account identity unknown until verified, but must not reuse an account explicitly reserved for production. Errors never include credential or account values. No production values are supplied by this change.

## 1) Service and database ownership (split DB contract)

Use three separate PostgreSQL URLs (Neon or equivalent):

- `DATABASE_URL_NEXOCLIP` — owned by NexoClip app + storyboard worker + `nexoclip-migrate`.
- `DATABASE_URL_SPITE` — owned by Spite web + Spite realtime + `spite-realtime-migrate`.
- `DATABASE_URL_SCHEDULER` (+ `DIRECT_URL_SCHEDULER`) — owned by Scheduler + `scheduler-migrate`.

Do not point multiple domains to one shared schema unless an explicit migration plan exists.

## 2) Realtime + ownership migration responsibilities

Migration jobs are one-shot containers and must run before long-lived services:

- `nexoclip-migrate` → applies NexoClip migrations.
- `spite-realtime-migrate` → applies Spite realtime/schema migrations.
- `spite-ownership-migrate` → runs `node scripts/migrate-spite-ownership.mjs` to enforce cross-service ownership contract.
- `scheduler-migrate` → applies Scheduler migrations.

`spite` and `spite-realtime` depend on both realtime + ownership jobs completing successfully.

## 3) Auth URLs and secrets contract

Production requires these realtime/auth values (no empty values):

- `CANVAS_AUTH_URL`
- `CANVAS_AUTH_HMAC_SECRET`
- `REALTIME_JWT_SECRET`
- `NEXOCLIP_INTERNAL_URL`
- `NEXT_PUBLIC_REALTIME_URL`

In production Compose, required vars are enforced with `${VAR:?message}` for critical realtime routing/token settings.

Guidelines:

- `CANVAS_AUTH_URL` and `NEXOCLIP_INTERNAL_URL` must resolve on the private Compose network.
- `NEXT_PUBLIC_REALTIME_URL` is browser-visible and should stay as a path (recommended: `/spite/ws`) behind Caddy.
- Never expose `*_SECRET`, API keys, or DB URLs through `NEXT_PUBLIC_*`.

## 4) Release order (must follow exactly)

From `nexoclip-app/`:

1. Prepare `.env.production` from `.env.production.example` and set secure values.
2. Enforce file permissions: `chmod 600 .env.production`.
3. Run deployment entrypoint:
   - `./scripts/deploy.sh`
   - or `./scripts/deploy.sh --pull` when updating base images.

`deploy.sh` performs, in order:

1. host architecture guard (`x86_64/AMD64`)
2. `.env.production` presence + mode check
3. `set -a; . ./.env.production; set +a; NODE_ENV=production npm run config:check` (**required preflight gate**)
4. `docker compose ... config --quiet`
5. build + ordered migration jobs
6. service startup + `docker compose ps`

If `config:check` fails, deployment must stop before any migration or `up`.

## 5) Validation and health checks

### Preflight validation

- `set -a; . ./.env.production; set +a; NODE_ENV=production npm run config:check`
- `docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet`

### Runtime health checks

- `spite-realtime`: `GET /healthz`
- `nexoclip`: root (`/`) non-5xx
- `spite`: `/spite/login` non-5xx
- `scheduler`: `/scheduler/login` non-5xx
- `vimax`: `/healthz`
- `redis`: authenticated `PING`

Caddy should be the only service exposing host ports; internal services remain private on the Compose network.

### Spite realtime operational commands

From `nexoclip-app/services/spite/` on the deployment checkout:

```bash
rtk npm run realtime:migrate
rtk npm run realtime:recover-projections
```

Use `realtime:migrate` before starting or re-starting `spite` / `spite-realtime` after schema changes.
Use `realtime:recover-projections` when `canvas_yjs_documents.projected_seq` lags `durable_seq` after a projector/persistence incident; it rebuilds compatibility tables from the authoritative Yjs document.

After either command, re-check:

```bash
rtk curl http://127.0.0.1:3007/healthz
```

## 6) Secrets and examples

- Keep real values only in `.env.production` (never commit it).
- Use `.env.production.example` as canonical production key list.
- `.env.example` is for local/dev defaults and references production-only keys where applicable.

## 7) Rollback note

Migrations are forward-only by default. If a release fails after migration, restore from a verified DB backup/snapshot and redeploy a known-good revision.
