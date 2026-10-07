# Provider billing and admin access

Implemented locally on 7 October 2026.

## Access

Admin pages require an authenticated session whose user ID is listed in the server-side `NEXOCLIP_OPERATOR_USER_IDS` configuration. Workspace `owner` and `admin` roles do not grant platform access. Unauthenticated page requests redirect to login; customer page requests redirect to Studio. Admin APIs reject unauthenticated requests with 401 and customer requests with 403. Layout and page entry checks cover direct HTML and partial RSC navigation. The legacy audit endpoint also requires platform operator access and workspace permissions.

## BytePlus billing

The Billing provider page supports CSV preview, confirmed import, duplicate detection, usage comparison and an immutable review note. Migration 037 adds append-only import, line and review records. Imports do not change customer balances, recognized revenue or generation cost observations.

CSV amounts use exact decimal arithmetic. Supported exports contain one BytePlus account, one billing month, USD currency and consumption-based pay-as-you-go rows. Package usage and savings-plan usage are explicitly flagged. Unsupported charges are rejected rather than inferred. Overlapping exports are rejected to prevent double counting; identical canonical exports reopen the existing import.

The supplied export was imported locally: 122 lines, USD 69.07, including 91 lines using package quota. Its consumption range is a partial October period, from 1 October through 5 October 2026 in UTC+8. No application provider requests were recorded in that range. A review note records that finding; review does not establish job allocation or final COGS.

## Accounting limits

The comparison uses pre-tax billing against known BytePlus request costs in the same dispatch period. Missing request costs remain unknown. CSV lines lack application request IDs; provider account and SKU mapping are not yet established. Differences therefore remain unallocated to jobs and customers. Package purchase costs, bank FX settlement and applicable contract adjustments require separate evidence. The page does not present these figures as final customer profit.

## Verification

- 473 regression tests passed with no failures or skipped tests.
- An isolated PostgreSQL integration test verified concurrent imports, decimal precision, rollback, duplicate reviews, late observations, stale review rejection and append-only protections.
- 30 live HTTP checks verified customer denial across ten admin pages in HTML and RSC modes, seven GET APIs and three POST APIs. The customer had workspace owner permissions. Temporary test sessions were revoked.
- Browser verification covered CSV preview, import, detail and review. Evidence: `/private/tmp/nexoclip-provider-billing.jpg`.

These changes are local; production deployment and a new Git push have not been performed.

## Historical SKU rate analysis

The next increment adds total, package and non-package usage plus pre-tax cost and effective USD per usage unit to CSV previews and stored import details. Ratios use BigInt decimal arithmetic, rounded half up to twelve decimal places; tiny token prices remain visible. Rates are grouped by configuration, billing unit and usage unit, so different units are never combined.

The effective rate divides pre-tax billed cost by total usage. It is a historical blended invoice ratio, not a catalog rate. Only groups without package usage or savings-plan usage are labelled observed PAYG. Zero usage and missing evidence produce an unknown rate. Package or plan usage prevents claiming a PAYG rate, even when the billed amount is zero. No pricing configuration, credit balance or job cost is changed. Explicit account/SKU-to-model mapping remains outstanding.

Verification for this increment: 21 targeted calculation, service, UI and access-control tests passed; the isolated PostgreSQL integration test passed with assertions for pre-tax rates and twelve-place package usage subtraction. `git diff --check` passed.

## SKU mapping

Migration 038 adds append-only SKU mapping revisions scoped to an imported bill and its exact configuration, billing unit and usage unit. Operators choose a BytePlus model from the application's catalog, give an explanation, or explicitly remove a mapping. Previous mappings and their authenticated actors are retained. Import locking and expected revision IDs reject concurrent stale edits. Mapping changes invalidate the previous comparison review hash.

Mapping is metadata only: account attribution and per-request matching remain outstanding, and no job cost, sales price or credit balance changes. No mapping is inferred or preselected from a SKU name. The migration was applied locally. 23 focused tests and the isolated PostgreSQL integration test passed, including concurrent edit denial, mapping removal, review invalidation and append-only enforcement.

## Billing summary by mapped model

Stored import details now separate mapped and unmapped pre-tax supplier costs and summarize mapped SKUs per model alongside platform request observations. Monetary sums preserve eight decimal places; different usage units are never added. Models missing a mapped SKU or an application request show unknown comparison amounts. Package and plan costs remain explicitly incomplete. Removing a mapping moves its costs back to the unmapped total. This classification does not allocate any invoice amount to jobs or customers.

Verification: 27 focused billing, service, rendered UI and access-control tests passed. The isolated PostgreSQL integration test passed with mapped/unmapped summary assertions. `git diff --check` passed. No production deployment or additional push was performed.

## Provider account and request identity

Migration 039 adds a nullable numeric BytePlus billing account ID to append-only generation cost observations. Image and video workers pass their server environment to the recorder. `BYTEPLUS_BILLING_ACCOUNT_ID` must be confirmed against the API credential owner; provider payloads and customer inputs cannot assign it. Missing configuration stays null, and historical records are not backfilled. The latest-observation view distinguishes accounts, including when an upstream request ID is reused. Failed BytePlus image HTTP responses preserve request IDs from response headers.

Billing details show matching, unidentified and other-account request counts and a separate account-filtered cost comparator. Unidentified or other-account requests are excluded from that account comparator. Existing platform-wide model summaries remain explicitly labelled. The migration is applied locally; account configuration is pending user confirmation, and running workers will need a restart after that configuration is set.

Exact invoice-to-job allocation remains pending because the supplied aggregate CSV contains no request IDs. Request-level charge evidence is required; no costs have been redistributed or assigned to customers by inference. Verification: 440 regression tests and two isolated PostgreSQL integration tests passed. `git diff --check` passed.

## Request inventory

Billing details now list the latest observation per BytePlus request in the import's dispatch period, with job and workspace IDs, model, upstream request ID, account identity and match status, observed USD cost and its source. Missing identities/costs remain unknown; dispatch timestamp fallback is disclosed. Only selected metadata is returned, excluding prompts, asset URLs, credentials and provider response bodies. The list is capped at the latest 100 requests with an explicit truncation notice; summaries still cover the full period. It remains protected by the platform-operator gate.

Verification: 22 targeted service, rendered UI and access-control tests passed, plus the isolated PostgreSQL integration test asserting request identity, workspace/job scope, dispatch timing and account match classification. `git diff --check` passed. Account configuration confirmation and request-level billing evidence are still required for actual invoice-to-job allocation.

## Development and production billing

Migration 040 adds immutable import-environment records. CSV imports default to development and expose an explicit environment selector. Production import/classification requires its account to match server-side `BYTEPLUS_PRODUCTION_BILLING_ACCOUNT_ID`; the configured production account cannot be labelled development. Existing evidence remains unclassified until classified once with an operator identity and explanation. An existing classification cannot be overwritten. Environment changes invalidate previous comparison reviews.

The user-designated development import was classified locally (one import). List filtering and pagination distinguish development, production and unclassified evidence. This separation applies to supplier billing records; it does not retroactively classify all generation jobs or change Economics revenue/cost calculations. Generation environment attribution and final invoice-to-job allocation remain separate work. No production account configuration or credentials were set.

Verification: 24 targeted service, UI and authorization tests passed, and the isolated PostgreSQL integration test passed including production filtering and append-only environment enforcement. `git diff --check` passed.

## Generation environment and Economics

Migration 041 adds immutable generation environment labels. Image/video and ViMax job inserts read explicit server-side `NEXOCLIP_ENVIRONMENT`; request payload labels and `NODE_ENV` are not accepted as evidence. Missing configuration yields unclassified. Existing jobs remain unclassified. Local `.env.local` is configured development; server processes must load the updated configuration before new jobs are labelled.

Economics supports production, development, unclassified and all-environment filters at the SQL cohort boundary, so revenue, provider costs, fees, pagination and sandbox exclusions share the same selection. The dashboard initially selects production and explains the exclusion of unclassified historical jobs. API responses disclose the selected environment and item labels. No financial observations or balances were rewritten.

Verification: 287 regression tests passed. Nine PostgreSQL integration tests passed, including revenue/cost separation and environment immutability; the full fresh-schema baseline test was skipped because the local PostgreSQL 14 installation does not support an existing PostgreSQL 15+ foreign-key syntax. Migration 041 applied successfully to the local database. `git diff --check` passed. Production deployment and Git push remain outstanding.

## Production configuration safeguards

Deployment preflight now requires explicit production environment configuration. When BytePlus API credentials are enabled for production, configured billing and production-reserved account IDs must be present and equal. Development cannot reuse a production-reserved account ID. Web job creation and image/video worker startup use the shared validator, before queue connections. Production Compose supplies environment/account fields to all three services. Validation checks server configuration consistency, not remote ownership of an API credential; provider-console verification remains required.

Verification: 19 targeted production, environment, repository and worker tests passed. Credentials and account values are absent from validator error messages. No production credentials were populated and no deployment was performed.
