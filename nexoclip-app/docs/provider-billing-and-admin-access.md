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

## Provider payment and package purchase evidence

On 8 October 2026, migration 042 added append-only evidence for invoice payments and package/savings-plan purchases. The Billing provider detail form accepts USD, actual IDR paid, UTC payment date, reference and explanation. Effective IDR/USD is computed with exact decimal arithmetic. Records require a classified billing environment and platform-operator access; authenticated actors are retained. Import locking makes retries idempotent and prevents concurrent invoice payments exceeding the invoice total. An existing reference with different facts is rejected.

Evidence is attached to an import for review, not automatically allocated. Package purchases remain separate from invoice payments, and these records do not modify job COGS, credit balances or recognized revenue. Effective paid FX may include bank fees; no exchange-rate assumption is applied to job expenses. The app does not initiate bank/provider payments. No real payment values were entered. Formal package quota allocation and final reconciliation remain outstanding.

Verification: 27 targeted validation, service, UI and authorization tests passed; the isolated PostgreSQL test passed concurrent replay, conflicting reference, overpayment rejection, separate package evidence and immutable storage checks. Migration 042 applied locally. `git diff --check` passed.

### Package cost allocation by SKU

Migration 043 records append-only allocations of package purchase evidence on the same billing import. Operators enter the documented total quota and the portion consumed by a SKU, in that SKU's usage unit. The service locks the import, validates a consistent quota/unit for each purchase, caps aggregate allocated usage at both purchase quota and recorded SKU package usage, and prevents duplicate purchase/SKU allocations. Monetary amounts use exact decimal arithmetic with cumulative rounding; the unconsumed portion remains unallocated. One allocation snapshot per purchase/SKU is supported; incremental adjustments and allocation across billing imports are not yet supported.

The Billing provider page displays USD and actual paid IDR allocation amounts and evidence notes. This is SKU-level allocation only: generation cost events, customer credit balances, revenue, and per-job COGS remain unchanged. Request-level reconciliation still requires matching provider evidence. Package data is entered explicitly; importing a zero-cost package usage row does not invent a purchase cost or quota.


### Request-level reconciliation (non-package SKU)

Migration 044 adds immutable request reconciliation evidence and gives reconciled observations precedence over worker cost estimates in `latest_generation_cost_observations`. An operator selects an existing BytePlus request, an invoice payment for paid FX, and a mapped non-package SKU. A request-specific provider charge reference and note are required. Server validation checks account identity, classified job/bill environment equality, actual dispatch within the invoice period, unique job identity for the account/request, model mapping, and aggregate request charges not exceeding the SKU pre-tax amount. Package and savings-plan SKU matching remains unsupported; package quota allocations remain separate.

Saving atomically appends a reported `reconciled` generation cost event and an audit row. This updates Economics provider cost for that job, using the selected payment's paid FX, without changing customer credits or revenue. Monetary calculation is exact decimal with half-up rounding. Account locking and a unique account/request constraint prevent concurrent or cross-import duplicate charges. Replaying identical evidence is harmless; conflicting evidence is rejected. Original reconciliation rows cannot be edited; subsequent cost revisions use the correction workflow below. The request selector follows the searchable, paginated inventory described below.

No real request costs were reconciled during implementation. The supplied aggregate CSV lacks request IDs and has no matching application requests in its period; it therefore remains unallocated. Only synthetic integration fixtures exercised the workflow. Supplier tax and full-package/job allocation are not silently added to request pre-tax costs. Notion task updates were unavailable in this session.


### Audited request cost corrections

Migration 045 adds immutable cost correction records linked to an original request reconciliation, the previous cost event, a new cost event, payment evidence, SKU, provider evidence reference, explanation, and session operator. The correction form displays the original and current charge, requires a new evidence reference and reason, and sends the expected current cost event ID. The service retains the original request/job identity, applies the same account, environment, dispatch, model, package exclusion, and SKU amount checks, and calculates the cap using only current effective costs for other requests. Moving a charge between mapped non-package SKUs or selecting different invoice payment FX is supported with evidence.

Account/import locks serialize writes. A unique reconciliation/previous-event constraint permits one successor per version: identical retries are idempotent and conflicting or stale writes return 409. A supported zero-cost correction requires an operator's documented no-charge evidence, and retains all prior charges. The original reconciliation and every correction remain append-only. The latest reconciled event supplies Economics, while the billing audit table displays prior/new USD and IDR, operator ID, time, evidence and reason. Customer revenue/credit records are untouched. This is cost correction, not a bank refund or a customer credit refund.

Verification includes rendered audit escaping, customer denial, concurrent identical correction, stale conflict, unknown reconciliation rejection, SKU charge cap, zero-cost correction, original value retention, latest cost selection, and append-only enforcement on an isolated PostgreSQL schema. No real job costs were corrected. Changes remain local; push is deferred per user instruction. Notion was unavailable for task updates.


### Request inventory search and pagination

Billing detail accepts `requestPage` (integer 1–100000) and `requestSearch` (up to 128 characters, no control characters). Only authenticated platform operators can read the inventory. Search is a literal, case-insensitive substring match across request ID, model, job ID, workspace ID, account ID, and dispatch ID; SQL parameters with `strpos` keep `%`, `_`, and SQL-like input literal. The imported usage period remains mandatory regardless of the search.

The inventory returns 50 rows per page, deterministic ordering by dispatch/fallback time and observation ID, total matching row count, and page count. A single SQL statement computes the count and rows. No matches or out-of-range pages return an empty row set with the correct total. Paging/search do not alter cost summaries, account coverage, invoice data, or job cost mutations. The reconciliation request selector follows the current inventory page and search; opening another invoice resets request filters. Existing cancellation guards ignore stale detail fetch results.

This replaces the original latest-100 selector limit; the full period is accessible through pagination and search. Verification includes 111 unique requests across three pages without overlap, finding older request IDs, case/whitespace handling, literal wildcard/SQL-looking search, empty results, unchanged summary hashes, invalid parameter rejection, customer denial, API parameter forwarding and rendered navigation. No migration or real cost entry is required. Push remains deferred.


### Reconciliation audit CSV export

The detail page offers **Ekspor CSV audit**. `GET /api/admin/provider-billing?id=<import-id>&export=reconciliation-csv` is protected by both route and service platform-operator checks and returns an attachment with UTF-8 CSV, BOM, CRLF record separators, no-store caching, and nosniff. The generated filename contains only the validated invoice UUID. Unsupported export formats and invalid IDs are rejected; anonymous sessions and customers cannot export.

A read-only repeatable-read transaction obtains invoice metadata, all current request reconciliations and their entire correction history. The export includes a billing summary even when no requests have been reconciled. It ignores request pagination/search, includes only actually reconciled requests, and labels the scope as incomplete request-level pre-tax COGS: unmatched requests, package allocations, and provider tax are not silently converted into finalized costs. Current rows include original and effective USD/IDR values, original/current evidence and actors, UTC timestamps, job/workspace/request identities, SKU, and payment reference. Correction rows include previous/new values and evidence. Job model identity is taken from the job, preserving it if SKU mapping has subsequently changed.

CSV cells quote commas, quotes, and multiline notes; potentially executable spreadsheet formula prefixes are neutralized with an apostrophe. Long numeric identifiers and numeric identifiers with leading zeros also receive an apostrophe to preserve them in Excel. Machine consumers should account for these spreadsheet-safe text prefixes. Monetary decimal strings remain exact and unrounded in the file. A maximum of 10,000 records including the summary is enforced before loading audit rows. The browser surfaces HTTP failures and verifies CSV content type before offering the download.

Verification: CSV content, UTF-8/BOM/UTC metadata, multiline escaping, formula/identifier protection, empty audit, authenticated service access, attachment/cache headers, unsupported formats, rendered button scope, and PostgreSQL export containing the original charge and both corrections. No production deployment, new schema migration, actual cost correction or Git push was performed.

### Reconciliation status filter

Request inventory accepts `requestStatus=all|unreconciled|reconciled|corrected`; invalid values return 400 after operator authorization. These states are disjoint: `unreconciled` has no matching reconciliation on the selected invoice, `reconciled` has an initial reconciliation and no corrections, and `corrected` has at least one correction. A zero-cost initial reconciliation or correction retains its actual status. Status joins require invoice, provider account, request ID, workspace and job identity; sharing a request ID across accounts, jobs or tenants does not confer another request's reconciliation status.

Search and status are applied together by **Terapkan filter** and pagination resets to page one. **Reset filter** clears both; selecting another invoice also resets them. Search-scoped counts show all three states before the status filter, while the row count and pages use both filters. Rows show their reconciliation status. Initial matching options exclude requests already reconciled/corrected on that invoice; existing matches remain accessible through the correction workflow. The financial summaries and complete audit CSV export remain independent of request filters.

Verification: status validation, API propagation, customer denial, rendered status control/counts, reconciled-before-correction, zero-cost correction, 111-row status union and filtered pagination, combined search/status, unchanged financial summary payloads/hashes, and cross-invoice/account/job/tenant identity fixtures on isolated PostgreSQL. No migration or real cost mutation is required; changes remain local and unpushed.


### Per-request prerequisite explanations

Every request inventory row now includes `readiness: {canReconcile,reasons,eligibleGroupKeys}` computed on the server. Reasons cover absent request/account identity, account mismatch, unclassified/mismatched environments, missing or invalid dispatch, out-of-period timing, unverified/ambiguous job identity, existing current/other-invoice reconciliation, missing SKU mapping, package-only matching models, and absence of invoice payment evidence. Multiple reasons appear in **Prasyarat pencocokan**. A prerequisites-available message explicitly asks the operator to enter provider cost proof; it does not claim a final verified charge. A reported/calculated/unknown existing cost does not by itself determine eligibility.

The repository supplies distinct matching job count for the same provider account/request and detects reconciliation on another invoice. Current-invoice status retains the earlier workspace/job checks. A matched or corrected row points to the cost correction workflow. Only rows with available prerequisites appear in the initial matching selector, and SKU choices follow that selected request's eligible model mappings. Changing requests clears draft charge/evidence and verification checkbox state. Server-side financial, scope, uniqueness and proof validation still executes during save; the read-only assessment is not authorization or a substitute for transaction-time validation.

Verification covers helper edge cases, half-open periods, zero-cost corrected rows, multiple blockers/escaped text, blocked request selection, missing payment followed by available prerequisites without altering cost or summary hashes, PostgreSQL account and multi-job identity checks, and existing operator/customer access tests. No migration, cost/credit mutation, external payment, or Git push was performed.
