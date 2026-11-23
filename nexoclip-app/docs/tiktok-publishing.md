# TikTok publishing setup

NexoClip connects a creator account with TikTok Login Kit, sends completed Nexoclip videos through Content Posting API, and tracks TikTok's upload/post status. Upload-to-Inbox lets the creator finish in TikTok. Direct Post is disabled for public visibility until the developer client has passed TikTok's audit.

## Environment

Set these on the Next.js app and the video worker. Keep all values server-side:

```env
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=https://app.nexoclip.com/auth/tiktok/callback
TIKTOK_ENV=sandbox
TIKTOK_APP_AUDITED=false
TIKTOK_TOKEN_ENCRYPTION_KEY= # 32 random bytes, represented by 64 hex characters
TIKTOK_VERIFIED_MEDIA_DOMAINS= # e.g. nexoclip.com, only after domain verification
TIKTOK_VERIFIED_MEDIA_PREFIXES= # alternative: verified HTTPS URL prefixes ending in /
```

Generate an encryption key with `openssl rand -hex 32`. The key encrypts TikTok access/refresh tokens and the short-lived upload URL using AES-256-GCM. Back it up securely; rotating it requires re-encrypting credentials before replacing the key, or users must reconnect. Do not expose these variables with a `NEXT_PUBLIC_` prefix.

Apply the migration using the normal app migration step (`npm run db:migrate`). TikTok publishing jobs are consumed by the existing video worker; configure its normal Redis/database/R2 variables as usual. The worker only enables TikTok polling when its client key and encryption key exist.

## Developer Portal checklist

1. Create a TikTok developer app and add **Login Kit (Web)** and **Content Posting API** products.
2. For production Web Login Kit, register `https://app.nexoclip.com/auth/tiktok/callback` and set the same `TIKTOK_REDIRECT_URI`. For local testing, enable the **Desktop** platform and register `http://localhost:8080/auth/tiktok/callback` under its redirect URIs; set that exact value locally. Desktop callbacks allow HTTP only on `localhost`/`127.0.0.1`, require an explicit port, and require PKCE.
3. Add **Display API** and request `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.upload`, `video.publish`, and `video.list`. The inbox flow needs `video.upload`; Direct Post needs `video.publish`; importing public posts requires `video.list`; account details and counters need the respective profile/stats scopes. Existing connections must reconnect to consent to new permissions.
4. Add Nexoclip's app domain to the portal and complete any required domain/ownership verification.
5. Add a sandbox user and grant that user access to the app. Sandbox callbacks and posting are limited to the configured sandbox/test participants and do not create public posts.
6. Configure the HTTPS webhook callback as `https://app.nexoclip.com/auth/webhooks/callback`. Subscribe only to the documented Content Posting events `post.publish.failed`, `post.publish.complete`, `post.publish.inbox_delivered`, `post.publish.publicly_available`, `post.publish.no_longer_publicaly_available`, plus `authorization.removed` if the portal presents the authorization event subscription.
7. Do not set `TIKTOK_APP_AUDITED=true` until TikTok approves/audits the client. The server enforces `SELF_ONLY` for sandbox and unaudited apps regardless of browser input.

OAuth uses the state parameter and a short-lived HttpOnly cookie. Desktop localhost OAuth generates a fresh PKCE verifier per request, stores it encrypted with the short-lived state, and uses TikTok's required hex-encoded SHA-256 challenge. Production Web OAuth does not send PKCE.

## Sandbox end-to-end test

This is the manual verification procedure; repository tests are mocked and do **not** claim a successful TikTok sandbox run.

1. Start the migrated Nexoclip app and its video worker with the sandbox variables above. Local testing uses `http://localhost` through Caddy and the Desktop callback above; it does not use the Next.js dev-server port.
2. Log in with a Nexoclip user, open **Settings → Connected Accounts**, and connect a TikTok sandbox test user.
3. Generate a short Nexoclip video and wait until generation is complete. Open **Social Publishing** at `/studio/publish`, select a video, and review it; Video Studio's Publish button opens the same composer.
4. Select **Send to inbox**, confirm, and check the job status. Open TikTok as the test user to finish editing/publishing from the inbox. Video inbox uploads do not send captions; creators add them in TikTok. Photo inbox uploads support title and description.
5. If the sandbox app grants `video.publish`, try **Direct post** with `SELF_ONLY`; verify TikTok status changes and that the post remains private.
6. Verify duplicate webhook delivery does not duplicate status changes; inspect server logs for request IDs, never access tokens.

## TikTok review demo checklist

- Show OAuth connect/reconnect/disconnect and account isolation between two Nexoclip users.
- Show a completed video preview, caption edit, latest creator privacy choices, max-duration check, interaction controls, AI-generated disclosure, branded-content choices, and explicit confirmation.
- Demonstrate Upload-to-Inbox and explain that creators must finish in TikTok.
- Demonstrate Direct Post only for private test posts before audit; show public options only after approval.
- Show status polling and signed webhook verification, including replay/duplicate handling.
- Provide a public, reviewed use case for third-party creators. TikTok may reject internal-only or private-use integrations; app approval and audit are TikTok-controlled.

## Public post synchronization

The video worker imports public posts using `POST /v2/video/list/` with `video.list`. It works for public videos posted from a phone or another tool, as well as Nexoclip. Draft/private posts are not returned by TikTok. Only metadata, the thumbnail URL and TikTok share link are saved; video files are not copied into Nexoclip assets.

Connections with the permission are queued automatically. A full refresh runs every 30 minutes and Sync posts can request an earlier refresh, limited to once per minute. Each worker pass imports one page of 20 videos with a persisted cursor and lease. Interrupted crawls resume; failed pages retain their cursor. Upserts use the account/video ID pair so repeated pages do not duplicate posts. Only a completed full pass marks missing videos unavailable; it does not claim whether a missing post was deleted or made private. Periodic refresh also renews thumbnail URLs.

`GET /api/tiktok/posts` reads the signed-in user's workspace posts in pages of 50. `POST /api/tiktok/accounts/:accountId/sync` queues a refresh after membership, account ownership, origin, and granted-scope checks. Account responses include the last sync time and a sanitized error code. Disconnected accounts' posts are hidden. The UI lives in Settings → Connected accounts → TikTok posts.

Sandbox verification: add Display API/video.list in the portal, reconnect the sandbox user, publish a public video from the phone, and click Sync posts. Confirm its TikTok ID occurs once in `social_posts`; repeat sync and check the count does not increase. Inspect the thumbnail and View on TikTok link, pagination, disconnect visibility, and cross-user denial. This requires a real public post; the mocked tests do not verify TikTok's actual sandbox response.

## Publishing photos, videos and querying video details

`/studio/publish` loads 24 eligible items at a time for the selected media tab, with Load more. Videos remain scoped to successful generations owned by the signed-in user; photos remain workspace-scoped. Switching tabs reuses fetched pages and preserves selections; refreshing retains selected media for review. Gallery images use cached 512px thumbnails, while the review dialog and publishing still use originals. Video metadata is requested only for visible tiles. Local MP4 responses stream HTTP byte ranges (206) instead of buffering and returning the complete file; R2 continues to serve authorized redirect downloads. Photos can be selected and reordered (1–35), with a cover chosen in the review composer. Direct publishing fetches current creator settings, requires the user to select visibility (no default), enforces interaction restrictions, and requires explicit confirmation. Sandbox/unaudited clients remain private-only. Branded content cannot use private visibility. Confirmed posts appear in publishing history; closing the dialog does not cancel them.

Photo jobs use the documented `/v2/post/publish/content/init/` endpoint with `media_type: PHOTO` and either `DIRECT_POST` or `MEDIA_UPLOAD`. Set `TIKTOK_VERIFIED_MEDIA_DOMAINS` only after TikTok confirms domain ownership; domain ownership includes subdomains. Alternatively configure exact `TIKTOK_VERIFIED_MEDIA_PREFIXES`. Domain matching rejects lookalike hosts and prefix matching requires a path boundary. Photo source URLs are never accepted from the browser: the worker reads ordered tenant assets, normalizes PNG/JPEG/WebP into JPEG derivatives with a maximum 1080px edge, uploads them to R2, checks public accessibility without redirects, and passes those URLs to TikTok. Original images are preserved. Each source is limited to 20 MB and 16 megapixels. Publication derivatives currently remain under `workspace/social/job/`; configure retention cleanup before large-scale usage. Generated images keep AI disclosure enabled; uploaded original photos can choose it.

Video jobs use `FILE_UPLOAD`, a 250 MB application limit, bounded sequential chunks and the documented floor-based chunk count (trailing bytes are merged into the final chunk). The worker uses one upload at a time to stay within local memory limits. MP4/MOV duration is read from the `moov/mvhd` header, including version 1 durations. Local and R2 storage use their authorized download capabilities. Safe retries honor persisted next-attempt times; known publish IDs are queried before recovery, and ambiguous initialization is held for review rather than generating another post.

Status tracking uses `/v2/post/publish/status/fetch/`. `SEND_TO_USER_INBOX` means creator action is required, and is polled every 60 seconds locally. `PUBLISH_COMPLETE` means the post was published; public post IDs may arrive only after public moderation and are not expected for private posts. Unknown statuses are surfaced as an error. Terminal statuses cannot be regressed by a late inbox webhook. IDs are retained as strings to avoid 64-bit precision loss.

`POST /api/tiktok/videos/query` accepts an owned `accountId` and `videoIds` (1–20 decimal strings) with `video.list` consent. It calls `/v2/video/query/?fields=...` with `filters.video_ids`, validates returned IDs and upserts metadata, refreshed cover URLs, and views/likes/comments/shares into the tenant's posts. Connected accounts → TikTok posts → **Refresh video details** uses this endpoint. Unreturned IDs are reported as unavailable; a failed/partial query does not delete saved posts.

References: https://developers.tiktok.com/docs/en/content-posting-api-reference-photo-post, https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide, https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status, https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query.

## Current limits

- Extended account profiles and latest counters are saved in `social_accounts.profile_data`, refreshed by the worker every 30 minutes, and displayed under Account insights. The request includes only fields covered by the user's granted scopes; missing stats show as unknown rather than zero. Manual refresh is owner/workspace scoped and limited to once per minute. The documented profile link field is `profile_deep_link`; the current User Info field table does not document `profile_web_link`.
- `video.manage` is described in TikTok's scopes reference, but a public endpoint/payload contract for inspect/edit/status/delete was not discoverable in the official Content Posting API reference during implementation. No guessed management endpoints are called and the destructive scope is not requested yet. Implement edit/delete only after obtaining that official contract, including ownership checks, explicit confirmation, idempotency and status tracking. References: https://developers.tiktok.com/docs/en/tiktok-api-scopes and https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post.

- Only MP4 and MOV videos up to 250 MB from a successful generation owned by the signed-in Nexoclip user are accepted. The worker checks the MP4/MOV container and duration, then compares it with TikTok's current creator maximum (Direct Post) or the upload cap.
- Video uploads use `FILE_UPLOAD`; photos use `PULL_FROM_URL` only with verified domain/prefix configuration and public R2 storage.
- Upload transfer uses bounded sequential chunks and retries known transient failures. If the init response is ambiguous or TikTok state cannot safely be resumed, the job is marked for review instead of blindly starting a second post.
- TikTok status polling and webhook updates use documented event/status values. Nexoclip scheduling is implemented locally in its durable job queue; it is not a TikTok scheduling endpoint.
- TikTok's review, sandbox access, upload processing, post moderation, and actual account behavior still require portal credentials and real test users.

## Saved drafts, schedules and manual recovery

Apply migration `071_social_scheduling_drafts.sql` before updating the app and video worker. No additional environment variables or TikTok scopes are required.

The publisher's **Save draft** action stores a private workspace/user draft in PostgreSQL. **Saved drafts → Continue editing** re-resolves owned media and authorized accounts after reload. Account credentials, arbitrary client URLs, consent and publish idempotency keys are never saved in the draft. Concurrent edits/deletes require the current version. An unavailable account must be reconnected or explicitly replaced; it is not silently substituted.

**Schedule for later** supports a time one minute to 30 days ahead. The browser shows its IANA time zone and sends an offset-bearing timestamp; the server stores UTC plus the display zone. Users explicitly confirm content, settings and schedule. The job remains `scheduled` until the video worker claims it after its due time. **Change time** and **Cancel schedule** only work while the job is still scheduled and has no provider publish ID. Cancellation races are resolved by the same PostgreSQL row update as worker claiming. To change content/media, cancel first and review a new post. Drafts themselves are never dispatched. Account membership/status/scopes, media and creator privacy/interaction limits are checked again when dispatch starts; revoked permissions stop the job. Keep the persistent video worker running: Nexoclip does not promise exact TikTok publication time, and overdue schedules are picked up after downtime.

For a `needs_review` job, **Check TikTok status** calls only the documented `/v2/post/publish/status/fetch/` with its existing publish ID. If TikTok reports a still-incomplete file upload and its upload URL is retained, **Resume existing upload** queues that same request; the worker checks uploaded bytes and resumes only at a safe chunk boundary. A short database lease limits concurrent checks; conditional writes preserve terminal webhook results arriving during a check. Without a publish ID, automatic retry/resend remains unavailable: inspect the creator's TikTok profile/inbox before creating another post. This flow cannot infer whether an ambiguous initialization reached TikTok.

Sandbox checks still required: save/reload/edit/delete a photo/video draft; schedule a private test post; change its time; cancel a second schedule and confirm nothing is submitted; restart the worker before the first schedule is due and confirm one publish ID; disconnect a third scheduled account and confirm it fails without submission. Stop a multipart upload after one accepted chunk, restart, and verify the original publish ID and remaining bytes. Mock tests simulate this transfer; they are not a real TikTok interruption test.

Automated service/route tests: use the Node command in [SOCIAL_PUBLISHING_IMPORTANT.md](./SOCIAL_PUBLISHING_IMPORTANT.md). For the PostgreSQL suite, create a disposable empty local database whose name starts `nexoclip_social_test_`, set both `DATABASE_URL` and `TEST_DATABASE_URL` to it, then run `node --test src/services/socialPublishing.integration.test.mjs`. It applies all migrations and inserts fake fixtures; never point it at customer data. It does not contact TikTok or R2. Remove only that disposable database afterwards.
