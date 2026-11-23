# Meta / Instagram Unified Login — local first

Implemented: connect/reconnect via Unified Login, session-bound OAuth state, encrypted Business Integration System User token, shared Instagram/ad account discovery, owner-scoped account list, local disconnect, and Marketing API account-level reporting (last 7 days / 30 days / this month). Instagram post sync and confirmed photo/carousel/Reels publishing are implemented below. Campaign creation, ad activation, budget mutation, messaging, automatic token management and Meta webhook processing are not enabled.

The existing TikTok publisher remains separate. Instagram connections reuse `social_accounts` with a Meta integration owner foreign key; Meta credentials are stored in `meta_integrations` and never in the TikTok credential table. There is no change to the Fly callback or OLA webhook registered in Meta. Until the app owner confirms this is a dedicated Nexoclip app, do not overwrite shared callback/webhook settings or globally revoke app permissions. **Disconnect here** clears only this user's Nexoclip credential and hides its linked assets.

## Configuration

The ignored `.env.meta.local` is loaded by the local Compose override for the app. `.env.local` is neither read nor modified by this setup. The following variables belong on the server only:

```env
META_APP_ID=
META_LOGIN_CONFIG_ID=
META_APP_SECRET=
META_REDIRECT_URI=
META_GRAPH_VERSION=v27.0
META_TOKEN_ENCRYPTION_KEY=
META_WEBHOOK_VERIFY_TOKEN=
```

Use the Meta App ID/secret, not an Instagram-only app ID/secret. The token encryption key is 32 random bytes encoded as 64 hex characters. A local key has been generated without printing it. The webhook verify token is reserved for later endpoint implementation; it does not enable webhooks now.

The provided App ID is `1370480770821414`; Unified Login config ID is `1459653379459487`. Set `META_APP_SECRET` privately. Register an additional **HTTPS** redirect with path `/auth/meta/callback` on a domain serving this Nexoclip instance, and set the identical full URL as `META_REDIRECT_URI`. Never point Nexoclip at the old Fly callback: it cannot deliver the code to this implementation.

For local OAuth, use an HTTPS tunnel to Caddy at `http://localhost:80`; keep Next.js internal to Docker. Open the HTTPS tunnel URL in the browser, sign into Nexoclip on that origin, then connect Instagram. Starting from HTTP localhost but returning to a different HTTPS host loses the browser's session/state cookies and is refused. An ephemeral tunnel changes its URL on restart; update the registered URL and env accordingly. A tunnel exposes the app's normal sign-in surface publicly while running. No tunnel is started automatically by this integration.

Apply migration `072_meta_unified_login.sql`, rebuild the app, and recreate only the app service with the local Compose override after changing configuration. No Meta worker is required for this read-only phase. Do not deploy or set production secrets without authorization.

## Meta portal

- Use case **Manage messaging & content on Instagram**, under an app owned by a business portfolio. Select **API setup with Unified login** and an **Instagram Login Compatible** configuration.
- `instagram_basic` for profile/media discovery; keep `instagram_manage_messages` if required by the configuration. `instagram_content_publish` and `instagram_manage_insights` are for upcoming publishing/insights work, not features this phase implements.
- `ads_read` for reports, `ads_management` for future campaign management, and `business_management` for future Business Integration System User Token Management API support. Ask for optional assets/permissions only when the corresponding feature is needed. Comments/messages are not processed by this implementation.
- Add a real Instagram Business/Creator account as an Instagram Tester and accept the invitation. Development mode/Standard Access is for app roles; customer accounts require appropriate Advanced Access/App Review and Live mode.
- Select the correct business portfolio, IG account and optional ad account during login. Multiple IG/ad accounts are supported. A skipped ad account gives no reporting data.
- Do not replace `https://api.olaai.id/instagram/webhook` yet. No Nexoclip Meta webhook URL should be configured until its verified handler is implemented and shared-app ownership is resolved.

## Verification

Mock/unit/route tests:

```sh
node --test --test-isolation=none --test-reporter=spec src/services/metaService.test.mjs
```

PostgreSQL integration: create a disposable local DB named `nexoclip_meta_test_*`, set both `DATABASE_URL` and `TEST_META_DATABASE_URL` to it, then run:

```sh
node --test src/services/meta.integration.test.mjs
```

The suite applies all migrations, stores fake encrypted credentials and fixtures, and verifies ownership, composite foreign keys, session-bound one-use state, reconnect snapshots and local disconnect. It uses mocked Graph responses; it never sends a Meta post or creates ads.

Real test procedure:

1. Configure the secret and additional HTTPS callback. Open Nexoclip from that HTTPS origin and sign in.
2. Connected accounts → Connect Instagram. Verify both login choices, business/asset selection, user consent and callback success.
3. Confirm Instagram handles and ad accounts are listed only for the initiating workspace/user; repeat as a second Nexoclip user and check isolation.
4. Marketing Studio → Ads Manager. Select a shared ad account and period; compare the account-level figures with Meta Ads Manager using the same account/date range/timezone/currency. Empty reports display unknown rather than invented zeroes. Reports are for the ad account across its supported placements, not Instagram-only spend.
5. Reconnect with fewer assets/scopes; withdrawn assets must disappear after the complete successful snapshot. A failed onboarding snapshot must preserve the prior connection.
6. Disconnect here; this Nexoclip connection becomes unavailable and its credential is erased. Other app integrations are not revoked.

## Limits and next work

- Tokens are inspected on connect for validity, matching app, scopes, expiry and client business identity. Expired/revoked tokens require reconnect. Automatic BISU token refresh is not implemented; do not reuse the Instagram User token refresh endpoint for this token type.
- Onboarding uses cursor pagination without following credential-bearing `paging.next` URLs, a 45-second total network deadline, and at most 20 pages per asset type. Larger/slow portfolios fail without saving a partial snapshot; move asset discovery to a durable job before onboarding such clients.
- The report endpoint accepts only a persisted, owned ad account UUID and a bounded preset; it never accepts arbitrary Graph paths/account URLs. Currency and monetary values are preserved as strings until display. It has no background refresh or reporting cache yet; Meta quota failures are surfaced for manual retry.
- Instagram media publishing, scheduling, webhook verification/subscriptions, organic insights, comments/DMs, automated token management, and campaign management remain separate follow-up work. Requesting a permission does not implement its feature.
- Real Meta login/reporting has not been verified until the owner supplies the App Secret, registers the Nexoclip HTTPS callback and completes the consent flow. Notion MCP is unavailable in this session, so its task state has not been updated.

## Verification — 16 November 2026

- 54 unit/mock/route tests passed, including 11 Meta tests and the existing TikTok workflow tests.
- Six PostgreSQL integration scenarios passed against a disposable local database: empty/rerun migrations, encrypted assets and ownership, one-use session-bound OAuth state, report ownership/decimal strings, reconnect snapshots, and local disconnect. The disposable database was removed afterward.
- Migration `072` applied to the local application database; Docker web build passed and only the local app service was recreated. `/studio/ads` returned HTTP 200 and unauthenticated `/api/meta/accounts` returned HTTP 401.
- Browser tests with all API responses mocked passed: missing-configuration state, connected account display, Ads Manager navigation, reporting-period changes, and 390px mobile overflow checks. No Meta posts, campaign changes, or real Graph account/report requests were made.
- Runtime presence check printed booleans only: encryption key is configured; App Secret and redirect URI remain unset. The Connect action stays disabled until both are provided. The existing Fly callback and OLA webhook remain unchanged.

Primary references: [Unified Login setup](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started), [authentication](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/authentication), [permissions](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/permissions), [debug token](https://developers.facebook.com/docs/graph-api/reference/debug_token/), [Ads Insights](https://developers.facebook.com/documentation/ads-commerce/marketing-api/insights).

## Local HTTPS route — 17 November 2026

- `dev.nexoclip.com` now routes through the named Cloudflare connector `nexoclip-dev-tunnel` to `http://nexoclip-caddy-1:80` in `nexoclip_default`. The connector uses the ignored `.env.cloudflared.local` and restarts unless stopped. No Windows service was installed.
- Local `META_REDIRECT_URI` is `https://dev.nexoclip.com/auth/meta/callback`; the supplied App Secret is loaded without printing it. The local Compose app's `PUBLIC_APP_URL` now uses `https://dev.nexoclip.com` so same-origin checks accept requests from that browser origin. Use this HTTPS origin when testing Meta login; the HTTP localhost app remains reachable, but public-origin auth redirects now use the dev domain.
- Live checks: `/studio/accounts` HTTP 200; direct callback without OAuth state HTTP 307 to the dev account page with `state_invalid` (expected); unauthenticated OAuth start from dev HTTP 401, foreign origin HTTP 403. The user still needs to sign into Nexoclip on the dev origin and complete Meta consent. No successful Meta login/reporting is claimed yet.
- The local app becomes accessible through the tunnel while the connector and PC are running. Stopping the connector makes this dev hostname unavailable; production was not deployed or changed. Existing Fly callback and OLA webhook were not modified.

## Instagram publishing and post sync (local implementation)

- `GET /api/meta/posts?offset=0`: owner-scoped gallery, 24 metadata records per page. Photos, Reels and photo/video carousel metadata are imported from `/{IG_ID}/media`. Original files are not copied into Nexoclip. Counts omitted by Meta stay unknown rather than becoming zero. URLs can expire; the next sync refreshes them.
- `POST /api/meta/accounts/{accountId}/sync`: queues a durable background sync. Automatic full refresh every 30 minutes, one page per worker pass, manual refresh minimum one minute. Interrupted pagination resumes. Disconnect/reconnect invalidates old leases. Meta exposes at most 10K recent posts; deletion reconciliation covers the returned time window, older records are retained.
- `POST /api/meta/publish`: explicit consent, selected owned Instagram account, idempotency key, caption, `mediaType=photo|video`, workspace asset UUIDs and generation UUID for video. No media URLs or tokens accepted from the browser. `GET` returns this user's Instagram publishing history.
- Photo: one photo or 2–20 photos in selection order. PNG/WebP/JPEG inputs become an sRGB JPEG on a white square canvas without cropping. The preview explains padding. Video: a completed, owned Nexoclip MP4/MOV (3–900 seconds, current shared media picker limit 250 MiB), published as a Reel with share-to-feed enabled. Meta validates codec/frame-rate/audio compatibility asynchronously; unsupported files fail with a persisted status. Mixed photo/video carousels and Stories are not exposed in this version.
- Generated-media AI disclosure is enabled. Meta fetches prepared media from public HTTPS R2 URLs. Publication derivatives are retained like the existing TikTok photo flow; add lifecycle cleanup before large-scale usage.
- Durable worker: prepare media → ordered child containers if carousel → parent container → poll `status_code` → `media_publish` → persist returned media ID → refresh gallery. No multi-minute HTTP request. No automatic repeat of an ambiguous creation/publish POST. A lost publish response polls the existing container; PUBLISHED is success even if the final media ID response was lost. A FINISHED container with an earlier publish intent needs manual review. Worker-interrupted requests become needs_review, never silently replayed. Definitive rate-limit responses back off.
- Shared social tables are reused; TikTok queries explicitly filter its provider. Migration `073_instagram_publishing.sql` adds IG metadata/cursor/provider state without changing TikTok cursor semantics.
- The video worker now loads the optional local Meta env file alongside TikTok. Required config remains META_APP_ID, META_APP_SECRET, META_LOGIN_CONFIG_ID, META_REDIRECT_URI, META_GRAPH_VERSION and META_TOKEN_ENCRYPTION_KEY. Do not copy `.env.local` or expose credentials.

### Meta Developer Portal and manual test

1. Add `instagram_basic` and `instagram_content_publish` to the existing Facebook Login for Business / Unified Login configuration, then reconnect to grant updated consent. Ad reporting continues to use ads_read (or existing ads_management). Do not request messaging/manage-comments permissions just to publish.
2. Personal accounts must change to Creator or Business before authorization. If switched back afterwards, the documented account-type error becomes META_PROFESSIONAL_REQUIRED; generic error 10 remains a permission failure rather than being incorrectly labeled personal.
3. Standard Access / development mode is limited to authorized app test roles and assigned assets. Advanced Access/app review is needed for customers outside those roles. Keep the existing Nexoclip HTTPS callback registration. No Instagram webhook is required for these polled publishing/sync flows; do not replace another application's webhook.
4. Open https://dev.nexoclip.com/studio/accounts, connect/reconnect, click Sync now and verify phone-created photo/Reel/carousel metadata appears under the correct user. Try another workspace/user and confirm the connection/posts are absent.
5. Open /studio/publish → Instagram, choose a completed video or 1–20 photos. Review preview, caption, account and consent. Publish **only with the user's explicit confirmation**. Verify published status, the post on Instagram, and gallery sync. Test unsupported media, expired permission and a disconnected account.
6. Automated provider responses are mocked. PostgreSQL migration/ownership/lease/idempotency tests use an isolated real local database. These do not establish a verified real Instagram publish. No real post is sent by the automated tests.

Official references: [Unified Login content publishing](https://developers.facebook.com/documentation/instagram-platform/content-publishing), [Media creation and listing](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media), [Container status](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-container), [Eligibility and troubleshooting](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/eligibility-and-troubleshooting).

Notion MCP was unavailable for this implementation; no Notion task state is claimed or modified.

Verification on 17 November 2026: a read-only sync against the already-connected real Instagram account succeeded and stored one post locally, with no provider error. The existing connection includes instagram_content_publish. No real Instagram post was submitted during verification.

### Verification completed locally

- Node 20 container: `node --test src/services/instagramService.test.mjs src/services/metaService.test.mjs src/services/tiktokService.test.mjs src/services/tiktokPublishing.test.mjs src/services/socialPublishingWorkflow.test.mjs src/services/socialPublishingRoutes.test.mjs tests/assets/socialPublishingMediaPerformance.test.mjs` — 57 passed, zero failed/skipped. Provider calls are mocked.
- `node --test src/services/instagram.integration.test.mjs`, with DATABASE_URL and TEST_META_DATABASE_URL set to the same isolated `nexoclip_meta_test_*` database — 8 passed. Empty-database migrations, rerun, concurrent claims, cross-user denial, stale lease denial, idempotency, one-time publication and disconnect tested against real PostgreSQL. Meta responses are mocked.
- Additional retry regression after 40 successful job stages — all 11 Instagram unit/route scenarios passed.
- Web and worker Docker builds succeeded; only local app and video-worker containers recreated, prior environment values verified preserved.
- Mocked Playwright browser checks passed for Instagram selection, required explicit consent, photo queueing without TikTok domain settings, history, synced gallery, Sync now and 390px mobile layout. Existing TikTok media selection/pagination/lazy-preview checks also passed. No real posts sent.
- Real read-only Instagram sync succeeded: one post stored, connected status, no provider error. Local and dev `/studio/publish` each returned HTTP 200. Actual Instagram publication remains a manual test requiring the creator's confirmation.

### First local publish failure investigation

Job 26543d9f-a6c0-435f-8691-6fb3dcc3ece0 failed during media preparation before receiving a Meta container ID. The original generic META_OPERATION_FAILED record has insufficient evidence to identify the exact original exception. Rechecking the same asset succeeded: original read, JPEG conversion, R2 derivative upload and public HEAD 200. No Meta create/publish request was sent by diagnostics; the failed job was not requeued.

Worker now records the preparation/read/upload/container/publish phase, a safe storage error category and HTTP status without raw messages/credentials. Explicit temporary storage failures (network reset/timeouts, throttling, storage 5xx) retry with a bounded consecutive-failure count; missing objects and denied access fail without a blind retry. 24 Instagram/Meta unit/route scenarios passed, including preparation failure/retry without any Meta call. Worker-only local rebuild; production unchanged.

## Campaign-level Marketing API reads

Ads Manager now lists up to 50 campaigns for the selected owned ad account and reads campaign-level impressions, reach, clicks, spend, CPC, CPM and CTR for the selected bounded reporting period. The browser only receives whitelisted fields; no access token or arbitrary Graph path is accepted. This is read-only and does not create/edit/activate campaigns, ad sets, creatives or ads. Official reference: [Marketing API v27.0](https://developers.facebook.com/docs/marketing-api/reference/v27.0/).

## Paused campaign setup

Ads Manager can create an `OUTCOME_TRAFFIC` or `OUTCOME_ENGAGEMENT` campaign and one Instagram-only ad set with selected countries and daily budget. Both Meta objects are created as `PAUSED`, and the user must confirm the exact ad account before sending the request. No ad creative or ad is created, so the user completes creative setup in Meta Ads Manager before publication. Other objectives are not offered because their ad set setup needs additional destination, Page, app or pixel configuration not collected here. A failed ad set call can leave an empty paused campaign; the response includes the campaign ID so it can be completed or removed in Meta Ads Manager. `ads_management` is required; development-mode and app-review restrictions still apply.
