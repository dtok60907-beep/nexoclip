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

### Package purchase cost allocation to requests

Migration 046 links immutable package request usage to the existing reconciliation and its purchase/SKU allocation. The **Alokasi biaya paket ke job** form requires a provider request, mapped SKU/purchase allocation, consumed quota in the allocation's usage unit, a provider evidence reference, and an explanation. Account, classified environment, unique job identity, and actual dispatch period must match. Package consumption is entered from evidence; the aggregate CSV cannot identify which requests consumed package quota.

The cost basis is the paid purchase amount already allocated to the SKU, apportioned by verified request usage. Exact cumulative rounding in USD and IDR prevents request totals exceeding their source; remaining quota remains unassigned. This is allocated acquisition cost, not a provider-reported per-request USD charge. Cost events therefore use `calculated` with explicit package evidence metadata, while `reconciled` precedence replaces previous worker estimates. Economics counts each request once. No customer credit or revenue entry is changed.

Account/import locks serialize concurrent allocations. An identical retry returns the existing reconciliation, preserving its original rounding position, without appending another event; different evidence conflicts. A request already reconciled through another purchase, invoice, or PAYG cannot be allocated again. Usage cannot exceed the SKU purchase allocation. The interface shows remaining quota and omits exhausted allocations. Savings plans, mixed PAYG/package charges within one request, cross-import purchases, and corrections of package request allocations are not supported by this increment. Server and UI explicitly block the PAYG correction form for package allocations, so a correction cannot silently free or exceed package quota.

Audit CSV now includes `cost_basis`, `package_allocation_id`, and `package_consumed_quota`. Package rows use `allocated_package_purchase`; PAYG rows use `provider_request_charge`. The existing audit identity, operator, proof, and monetary fields remain. Package purchase evidence must describe the acquisition cost and quota; recording usage does not make unmatched costs, provider tax, or operational expenses complete.

Verification: 151 billing/admin/security/frontend regressions and the isolated PostgreSQL supplier integration test, including new package concurrency, full quota conservation, retry/conflict/access denial, append-only history, source metadata, and export assertions. No real package usage was entered automatically.

### Audited package request usage corrections

Migration 047 extends cost corrections with immutable previous/new package usage and the fixed purchase/SKU allocation. **Koreksi alokasi paket & riwayat audit** now allows changing a request's usage, including zero to cancel its allocation. This supersedes the package correction limitation in the preceding increment. Moving between purchases/SKUs/imports remains unsupported; PAYG correction still cannot change package allocation rows.

The operator supplies the expected current cost event, new usage, proof reference, and reason. Account/import locks serialize the change; server validation repeats identity, environment, dispatch, model, purchase/unit, and quota checks. Current effective usage and USD/IDR for other requests are used, preserving their costs. New request cost is the rounded cumulative cost for the new total usage minus the actual cost already assigned to other requests, floored at zero for rounding residuals; cancellation explicitly sets both costs to zero. The pool cannot exceed its SKU source amount or quota. A new allocation after corrections uses the same effective monetary pool, avoiding duplicated rounding residues.

The original allocation, cost event, and evidence remain unchanged. A cost correction and package usage correction are appended atomically; Economics reads the latest reconciled calculated cost. Remaining capacity uses effective corrected usage. Exact retry compares the original evidence for its version and returns without recalculating or writing; a different retry or stale uncorrected version returns conflict. Initial allocation retries also remain idempotent after corrections and quota reuse.

Read responses expose original/effective package usage and full correction history. CSV includes original and previous package quota fields alongside corrected quota, cost basis, old/new USD/IDR, proof, actor, and timestamps. Correction forms retain their purchase/SKU basis, reset with a new cost event, and require evidence confirmation. No customer credit ledger or recognized revenue is changed.

Verification: 156 billing/admin/security/frontend tests plus the PostgreSQL supplier integration passed. Database assertions cover concurrent cancellation, historical retry after capacity reuse, original allocation retry after correction, quota overflow, stale versions, customer denial, preserved costs on other requests, exact final pool amounts, append-only usage history, and CSV evidence. Real request usage was not entered during implementation.

### Economics cost evidence status

Economics now separates calculation coverage from provider evidence matching. `costEvidence` contains mutually exclusive request counts and known IDR amounts for estimated usage, provider-reported amounts without reconciliation, matched request charges, and matched package purchase allocations. Unknown costs remain separate. The total, model/provider breakdown, and job rows use the same categories.

Evidence classification joins the latest cost event to the immutable reconciliation or cost correction and its package allocation. Event type `reconciled`, cost source `reported`, and arbitrary usage metadata alone do not establish a billing match. Corrected package costs, including zero cancellations, retain their package evidence category without counting original events again. Existing financial coverage and monetary formulas remain unchanged; a complete calculation can still use unmatched costs.

The interface shows category counts and known amounts, matching progress per model/job, and a link to Billing provider. The complete-data notice now says calculation data is available and asks the operator to inspect proof status. Contributions with unmatched costs are labelled temporary. Unknown IDR amounts caused by missing FX remain explicitly incomplete. Every matched request still does not establish a final monthly invoice or net profit: remaining supplier costs, provider tax, hosting, storage, egress, and operational expenses are outside that claim. Old responses without evidence fields show status unavailable rather than infer matching from calculated/reported flags.

Verification: 158 billing/admin/security/frontend regressions and 11 PostgreSQL integration tests passed. The new PostgreSQL case partitions all categories, rejects evidence claims from an event label alone, checks per-model/per-job status, and follows a cancelled package cost without double counting. No real balances, request costs, or payment evidence were changed by this display/reporting increment.

### Economics reconciliation work filters

Economics accepts `costStatus=all|needs_reconciliation|reconciled|incomplete|estimated|provider_reported`, with a shared UI/server option list. Both service and repository reject other values. The route retains its session/operator and workspace membership guards; the selected value is bound as a query parameter.

Classification happens per terminal job after consolidating latest cost observations. Incomplete means missing provider cost, FX, dispatch/attempt coverage, or provisional provider observations. Reconciled requires a positive request count, every request linked to evidence, and complete provider cost coverage. Needs reconciliation includes incomplete, entirely unmatched, and partly matched jobs. Estimated and provider-reported selectors include jobs with at least one request in that unmatched source category. These filters describe provider costs; revenue/payment fee incompleteness remains separate.

Selection applies before total aggregation, model/provider grouping, history pagination, and filtered row count. A selected job retains all its costs, including matched expenses and retries, so filtering estimated work cannot inflate contribution by removing other request costs. Sandbox jobs remain excluded; their displayed excluded count describes the base period/environment cohort before cost-status filtering. Changing the UI selector clears the old report and resets to page one. The report states its selected scope and whole-job accounting basis.

Verification: 161 billing/admin/security/frontend tests and 11 PostgreSQL integration tests passed. Cases include a mixed-source job, a matched zero-charge job, missing FX, absent observations, an estimated-only job, sandbox exclusion, filtered empty results, unchanged totals across pages, and enum/SQL-input validation. This increment is read-only and requires no new migration.

### Navigasi Economics ke request Billing provider (8 Oktober 2026)

- Setiap job pada laporan Economics membawa tautan dengan pasangan UUID workspace/job dari respons server. Job yang berakhir di provider lain tetap dapat ditelusuri untuk melihat percobaan BytePlus sebelumnya.
- Halaman billing dan API tetap memerlukan platform operator. API menolak scope parsial/tidak valid; query request membatasi workspace dan job secara persis, bukan substring pencarian.
- Pilihan invoice terkait hanya berasal dari akun provider yang tercatat, waktu dispatch aktual pada rentang `[period_start, period_end)`, dan lingkungan job/invoice yang sama. Tanggal terminal job dan tanggal observation fallback tidak memilih invoice. Job tidak ditemukan pada workspace memberikan 404.
- Beberapa invoice ditampilkan sebagai pilihan; tidak ada invoice dipilih berdasarkan asumsi tagihan terbaru. Tidak adanya invoice cocok ditampilkan dengan penjelasan untuk memeriksa bukti dispatch dan impor billing.
- Filter tetap berlaku saat memilih invoice atau mengganti pencarian/status/halaman request. Tombol “Tampilkan semua job” melepas scope. Ringkasan invoice, koreksi, dan ekspor audit tetap seluruh invoice dan dijelaskan di UI.
- Navigasi tidak mengubah biaya, saldo, pendapatan, atau bukti rekonsiliasi. Verifikasi: 166 tes billing/admin/security/frontend dan 11 tes integrasi PostgreSQL dengan schema sementara lolos; `git diff --check` bersih. Browser interaktif dan build produksi belum diverifikasi pada perubahan ini. Belum di-push; Notion belum diperbarui karena konektor tidak tersedia.

### Panduan pencocokan untuk biaya job belum lengkap (8 Oktober 2026)

- Detail billing menampilkan urutan pemeriksaan identitas request, pemetaan SKU, bukti pembayaran/kurs, alokasi paket, dan pemeriksaan ulang Economics. Panduan mengingatkan bahwa bukti per request diperlukan, termasuk untuk job gagal; invoice agregat tidak boleh dibagi secara perkiraan.
- Kolom prasyarat request sekarang mengarahkan admin ke panel yang dapat menyelesaikan kekurangan, seperti pemetaan SKU, pembayaran, pemilihan invoice, dan alokasi paket. Kekurangan dispatch/identitas hanya memberikan instruksi pemeriksaan, bukan tombol yang memalsukan bukti.
- Jalur langsung dan paket dinilai dari readiness server yang sudah ada. Ketika jalur paket siap, UI menampilkan bukti usage dan form paket tanpa menampilkan kegagalan jalur langsung sebagai penghalang. Jika keduanya terhalang, prasyarat masing-masing jalur ditampilkan terpisah. Request yang sudah dicocokkan diarahkan ke form koreksi sesuai sumber biaya sebelumnya.
- Semua tautan menuju panel yang benar, dengan target dapat menerima fokus dan margin gulir untuk navigasi keyboard. Kesiapan prasyarat tetap tidak berarti biaya/bukti sudah disetujui atau margin final.
- Tidak ada perubahan query keuangan, migrasi, saldo, atau aturan penyimpanan. Verifikasi: 172 tes billing/admin/security/frontend lolos, termasuk pengujian jalur paket, identitas ambigu, kuota habis, koreksi, escaping teks, dan target panel; `git diff --check` bersih. Tes integrasi PostgreSQL terakhir pada perubahan navigasi sebelumnya: 11 lolos; tidak diulang karena perubahan ini hanya panduan tampilan. Browser interaktif/build produksi belum diverifikasi. Belum di-push; Notion belum diperbarui karena konektor tidak tersedia.

### Ringkasan job dan penyebab kekurangan (8 Oktober 2026)

- Economics menampilkan jumlah job unik yang perlu diperiksa untuk seluruh hasil filter/periode/workspace. Agregasi berasal dari CTE `financials` sebelum pagination, mengikuti pengecualian sandbox dan filter biaya yang sama dengan total laporan.
- Sepuluh kategori mencakup biaya request belum diketahui, kurs belum tersedia, catatan biaya/attempt belum lengkap, biaya sementara, bukti belum dicocokkan, nilai kredit/biaya gateway belum diketahui, settlement pending, serta ketidaksesuaian alokasi kredit. Hitungan kategori adalah jumlah job, bukan jumlah request/kredit; kategori dapat tumpang tindih tanpa menggandakan total job yang perlu diperiksa.
- Daftar penyebab per job secara eksplisit mengikuti halaman Detail job. Kekurangan provider memiliki tautan scoped job/workspace ke Billing provider; biaya gateway memiliki tautan yang membuka panel rekonsiliasi pembayaran. Kekurangan pendapatan/settlement/alokasi mendapat instruksi pemeriksaan sesuai penyebabnya.
- Status failed saja bukan kekurangan biaya. Job gagal dengan bukti dan data lengkap tidak ditandai. Biaya provider sudah dicocokkan tidak menutupi kekurangan pendapatan atau gateway. Respons lama tanpa agregasi baru ditampilkan sebagai belum tersedia, bukan nol masalah.
- Tidak ada perubahan rumus biaya, saldo, atau mutasi keuangan; tidak memerlukan migrasi. Verifikasi: 177 tes billing/admin/security/frontend dan 11 tes PostgreSQL lolos. Kasus integrasi memeriksa kategori tumpang tindih, pagination, sandbox, filter kosong, job gagal lengkap, pendapatan legacy tanpa nilai, dan isolasi workspace. `git diff --check` bersih. Browser interaktif/build produksi belum diverifikasi. Belum di-push; Notion belum diperbarui karena konektor tidak tersedia.

### Filter berdasarkan penyebab masalah (8 Oktober 2026)

- Economics menyediakan filter semua penyebab, semua job yang perlu diperiksa, dan sepuluh penyebab pada ringkasan. Kategori ringkasan dapat diklik; perubahan penyebab menghapus respons lama dan kembali ke halaman pertama. Reset penyebab mempertahankan lingkungan, rentang waktu, workspace, serta status biaya.
- Service dan repository memvalidasi enum penyebab; pilihan diikat sebagai parameter SQL. Kondisi penyebab diterapkan bersama status biaya sebelum totals, breakdown, attention, dan pagination. Seluruh biaya/revenue job terpilih tetap dihitung, termasuk request yang sudah dicocokkan dalam job dengan request lain yang belum dicocokkan.
- Filter provider reconciled dapat digabungkan dengan kekurangan pendapatan/gateway; kombinasi tanpa job cocok menghasilkan laporan kosong, bukan mengabaikan salah satu filter. UI menjelaskan penggabungan filter tersebut.
- Tidak ada perubahan saldo, mutasi biaya, atau migrasi. Verifikasi: 180 tes billing/admin/security/frontend dan 11 tes PostgreSQL lolos. Integrasi menguji seluruh sepuluh penyebab, filter any, gabungan status biaya, pagination di luar hasil, serta jumlah COGS seluruh job. `git diff --check` bersih. Browser interaktif/build produksi belum diverifikasi. Belum di-push; Notion belum diperbarui karena konektor tidak tersedia.

### Ekspor CSV job bermasalah (8 Oktober 2026)

- Tombol Economics mengekspor semua job yang perlu diperiksa pada workspace/periode/lingkungan/status biaya/penyebab aktif. Pilihan semua penyebab menjadi `any` saat ekspor; pagination layar tidak membatasi file. Filter spesifik dan penggabungan status biaya tetap berlaku.
- Endpoint `GET /api/admin/economics?export=job-issues-csv` memakai tenant yang sudah diverifikasi dan platform operator sebelum memanggil service. Respons termasuk error bersifat private/no-store; CSV menggunakan attachment, nosniff, dan Vary Cookie. Format ekspor tidak dikenal ditolak.
- Service memakai satu statement repository untuk snapshot baris dan total yang konsisten. Batas 5.000 job diberlakukan di server (fetch maksimal 5.001); jumlah lebih besar ditolak 413 dengan instruksi mempersempit filter. Snapshot yang tidak lengkap ditolak, tidak diekspor secara diam-diam.
- CSV memiliki ringkasan cakupan serta baris job dengan ID workspace/job, cohort UTC, status job/settlement, penyebab, langkah pemeriksaan, bukti provider, coverage biaya/pendapatan/gateway, nominal diketahui, simulasi terpisah, dan tautan relatif ke request job. Batas akhir periode eksklusif disimpan eksplisit. File kosong tetap memiliki baris ringkasan.
- String NUMERIC database ditulis langsung untuk menjaga presisi dalam CSV; angka hilang tetap kosong. Teks yang dapat menjadi formula spreadsheet dinetralkan, quote/newline di-escape, UTF-8 BOM disertakan. Komponen diketahui dan simulasi tidak dinyatakan sebagai COGS/laba final.
- Unduhan memakai sesi dan workspace aktif, membatalkan request saat filter/workspace berubah, serta membersihkan object URL. Tidak ada perubahan saldo, biaya atau migrasi.
- Verifikasi: 188 tes billing/admin/security/frontend dan 11 tes PostgreSQL lolos. Mencakup akses customer/workspace lain, filter aktif, seluruh halaman, batas ukuran, snapshot tidak lengkap, ekspor kosong, presisi dan formula CSV, serta pengecualian sandbox/job lengkap. `git diff --check` bersih. Browser interaktif/build produksi belum diverifikasi. Belum di-push; Notion belum diperbarui karena konektor tidak tersedia.
### Pengelolaan akses akun (8 Oktober 2026)

- Accounts menyediakan tombol Kelola akses akun untuk suspend, aktivasi kembali, dan pencabutan seluruh sesi login web/API. Tindakan berlaku untuk akun pada semua workspace; saldo kredit, pembayaran, membership, dan job yang sudah diterima tetap mengikuti prosesnya masing-masing.
- GET/POST `/api/admin/account-access` memerlukan sesi aktif dan platform operator. Customer ditolak sebelum query pengelolaan. Akun sendiri dan seluruh akun dalam allowlist operator dilindungi. POST memvalidasi origin, JSON, ukuran payload, alasan 10–500 karakter, UUID request, serta versi akun.
- Migrasi 048 menambahkan status suspend, versi akses, audit append-only, dan guard database untuk pembuatan sesi. Lock akun menyerialkan login password/OAuth/sistem dengan suspend atau revoke. Pencabutan sesi, perubahan status/versi, dan audit tersimpan dalam satu transaksi; kegagalan audit membatalkan semuanya. Retry identik tidak mengulangi tindakan; versi lama atau pemakaian kunci untuk tindakan berbeda ditolak.
- Suspend menolak sesi lama dan login baru. Aktivasi tidak memulihkan sesi lama; pengguna harus login kembali. Revoke pada akun aktif mencabut sesi lama dan tetap mengizinkan login baru. Audit menampilkan operator, alasan, waktu UTC, versi, dan jumlah catatan sesi yang dicabut tanpa token/password.
- Cakupan pencabutan adalah sesi login web/API. Token realtime yang sudah diterbitkan dan koneksi realtime yang sudah terbuka belum otomatis diputus; job yang sudah diterima tidak dibatalkan oleh perubahan akses akun.
- Migrasi 048 diterapkan pada database development lokal; akun yang ada tetap aktif. Tidak ada akun customer nyata yang disuspend atau sesi nyatanya dicabut saat pengujian.
- Verifikasi: 234 tes regresi, 13 tes integrasi PostgreSQL, dan 2 tes integrasi login dengan schema sementara lolos (249 total). Mencakup login password/OAuth, race pembuatan sesi, retry konkuren, rollback audit, perlindungan operator, akses customer, dan histori immutable. Browser interaktif/build produksi belum diverifikasi. Belum di-push; Notion belum diperbarui karena konektor tidak tersedia.

### Pencabutan akses realtime Canvas (8 Oktober 2026)

- Kedua endpoint token realtime sekarang menyertakan `sessionId` dari sesi server yang terverifikasi. Introspeksi sesi main app mengembalikan ID sesi tanpa token/hash dan menggunakan no-store. Header atau ID sesi dari browser tidak menjadi sumber identitas. JWT lama tanpa binding sesi ditolak; TTL JWT untuk pembukaan koneksi tetap 60 detik.
- Realtime memeriksa sesi pada autentikasi, sebelum hidrasi, saat connected, dan sebelum setiap pesan diproses. Query mengikat session ID ke pemilik, menolak user suspended, sesi revoked, dan sesi kedaluwarsa. Pesan yang ditolak tidak diterapkan atau disimpan; perubahan yang sudah diterima sebelumnya tidak dibatalkan.
- Koneksi yang diam diperiksa berkala dengan interval default 5 detik, ditambah waktu query database. Koneksi tidak valid menjadi read-only dan ditutup. Token sesi lama tetap ditolak setelah aktivasi; login baru memerlukan sesi baru. Kegagalan database autentikasi menolak akses dengan alasan generik tanpa detail koneksi.
- Database autentikasi menggunakan `DATABASE_URL` main app pada proses realtime, dengan pool tersendiri dan timeout koneksi/query 3 detik. Canvas dapat tetap memakai `DATABASE_URL_SPITE`; database Canvas tidak digunakan sebagai pengganti bukti sesi. Deployment memerlukan migrasi 048 dan pembaruan main app/Canvas/realtime bersama, serta restart proses realtime. Tidak ada migrasi tambahan atau perubahan saldo.
- Verifikasi: `node --test` untuk auth/operator/account access/frontend/realtime main app: 39 lolos; `node --import tsx --test --test-force-exit` untuk auth/session access/server core/lifecycle/dua endpoint Canvas: 37 lolos; tes integrasi PostgreSQL dengan schema sementara: 1 lolos (77 total). Tiga kasus pemutusan baru juga lolos sendiri tanpa force-exit; suite core gabungan memakai force-exit karena fixture menyisakan handle setelah tes selesai, dan proses tes yang tertinggal dibersihkan. `git diff --check` bersih.
- Typecheck seluruh Canvas belum lolos karena masalah tipe query Neon dan tes legacy di luar perubahan ini; diagnostik terakhir tidak menunjuk file realtime/auth/session access yang berubah. Browser interaktif dan build produksi belum diverifikasi. Belum di-deploy atau di-push; Notion belum diperbarui karena konektor tidak tersedia.

### Pencarian, status, dan pagination Accounts (8 Oktober 2026)

- Accounts mencari nama/email secara case-insensitive dan menyediakan filter Semua status, Aktif, atau Disuspend. Pilihan halaman 10/25/50/100 akun (default 25), range hasil, jumlah total, serta tombol Sebelumnya/Berikutnya menggunakan data server. Karakter `%`, `_`, dan backslash dicari secara literal, bukan wildcard operator.
- GET backoffice menerima `q`, `status`, `page`, dan `pageSize`. Service memeriksa platform operator sebelum query; service/repository berbagi validasi enum, batas 120 karakter pencarian, ukuran halaman yang diizinkan, dan halaman 1–1.000.000. Parameter SQL diikat; password/hash/token tidak masuk daftar.
- Jumlah total dan baris halaman berasal dari satu snapshot SQL. Akun dipilih berdasarkan created_at DESC dan ID sebelum penggabungan workspace, sehingga banyak membership tidak menggandakan akun/total atau mengurangi ukuran halaman. Akun tanpa workspace tetap ditampilkan. Business billing mempertahankan daftar kontak maksimal 100 hasil dan petunjuk mempersempit pencarian.
- Pencarian, perubahan status/ukuran halaman, dan reset kembali ke halaman pertama. Request lama dibatalkan dan respons usang diabaikan. Kegagalan daftar memiliki retry terpisah dari error profil. Jika refresh setelah suspend mengurangi jumlah halaman, halaman disesuaikan ke halaman terakhir yang tersedia. Refresh pencarian tidak mereset draft/detail invoice yang dipilih.
- Tidak ada migrasi tambahan, perubahan saldo, status akun nyata, atau mutasi pembayaran. Verifikasi: 137 tes admin/frontend/security dan 3 tes integrasi PostgreSQL lolos (140 total). Pengujian DOM memeriksa interaksi filter/pagination/search/reset/retry, pembatalan respons, hasil kosong, dan halaman yang menyusut. Fixture PostgreSQL 109 akun memeriksa seluruh halaman tanpa kehilangan/duplikasi, status, pencarian literal, membership ganda, akun tanpa workspace, serta regresi settlement dan akses customer.
- `git diff --check` bersih. Browser aplikasi dan build produksi belum diverifikasi pada increment ini. Belum di-push; Notion belum diperbarui karena konektor tidak tersedia.

### Pagination riwayat detail akun (8 Oktober 2026)

- Detail Accounts menyediakan pagination terpisah untuk aktivitas sesi, pembayaran workspace, dan ledger kredit, dengan default 25 dan pilihan 10/25/50/100 entri per halaman. Riwayat lebih lama dari 50 entri dapat diakses; generate, sumber kredit, dan audit tetap maksimal 50, sementara invoice tetap 100 terbaru.
- Aktivitas sesi mencakup akun yang dipilih di seluruh workspace. Pembayaran dan ledger tetap milik workspace bersama, termasuk transaksi anggota lain. Cakupan ditampilkan pada tiap tabel; pagination tidak mengubah saldo atau rumus keuangan.
- GET backoffice menerima `history=sessions|payments|ledger`, workspace/customer UUID, page, dan pageSize. Platform operator diperiksa sebelum query; jenis riwayat dan pagination divalidasi bersama di service/repository. Target wajib masih menjadi anggota workspace. Pemeriksaan membership, hitungan, dan baris halaman berasal dari satu statement SQL; target di luar workspace ditolak 404, customer 403, dan anonymous 401.
- Query hanya menggunakan daftar sumber/kolom yang diizinkan, parameter terikat, serta urutan created_at DESC dan ID DESC. Nominal pembayaran/kredit ditulis sebagai string dari NUMERIC database untuk menjaga presisi. Token, hash/password, metadata ledger, dan payment URL tidak dikirim. Tiap request memiliki snapshot count/baris sendiri; pagination bukan snapshot tetap lintas request saat ada aktivitas baru.
- Profil awal memuat halaman pertama beserta metadata pagination. Navigasi satu riwayat tidak memuat ulang seluruh profil atau mengubah halaman riwayat lain. Request lama dibatalkan dan respons usang diabaikan; akun/workspace baru mereset pagination. Error memiliki retry dan halaman yang menyusut dimuat ulang pada halaman terakhir, termasuk kembali ke halaman pertama tanpa memakai cache awal yang usang.
- Verifikasi: 141 tes admin/frontend/security dan 3 integrasi PostgreSQL lolos (144 total). Fixture mencakup 63 entri per riwayat, seluruh halaman, akun/workspace lain, hilangnya membership, riwayat kosong, timestamp sama, pembayaran anggota lain, serta nilai kredit presisi tinggi. Tes interaksi DOM memeriksa pager independen, ukuran halaman, stale response, pergantian akun/workspace, error/retry, dan count yang menyusut. `git diff --check` bersih. Tidak ada migrasi tambahan atau perubahan akun/saldo nyata. Browser aplikasi/build produksi belum diverifikasi; belum di-push. Notion belum diperbarui karena konektor tidak tersedia.

### Filter tanggal riwayat detail akun (8 Oktober 2026)

- Aktivitas sesi, pembayaran workspace, dan ledger kredit masing-masing memiliki filter Dari/Sampai (UTC), tombol Terapkan tanggal, serta Reset tanggal. Draft tanggal tidak memuat ulang hasil sebelum diterapkan. Apply/reset kembali ke halaman pertama; pagination, ukuran halaman, dan retry mempertahankan rentang yang diterapkan. Pergantian akun/workspace mereset filter.
- Parameter opsional `from`/`to` menggunakan tanggal kalender YYYY-MM-DD yang divalidasi di client dan server, termasuk tanggal kabisat dan urutan rentang. Awal hari UTC inklusif; batas SQL akhir adalah awal hari berikutnya eksklusif agar seluruh tanggal akhir, termasuk presisi mikrodetik, tercakup. Tanggal akhir maksimal 9999-12-30; batas kosong berarti tanpa batas.
- Semua riwayat difilter berdasarkan `created_at`. Pembayaran mengikuti tanggal order dibuat; tabel menampilkan tanggal Dibuat dan Dibayar secara terpisah. Respons menyertakan metadata periode, basis created_at, dan zona UTC. Membership target, filter tanggal, total, dan baris halaman diperiksa dalam satu snapshot SQL dengan parameter terikat.
- Verifikasi: 143 tes admin/frontend/security dan 2 integrasi PostgreSQL lolos (145 total, tidak ada tes integrasi dilewati). Mencakup batas hari mikrodetik, tanggal kabisat, batas satu sisi, tanggal/rentang tidak valid, pagination dengan filter, isolasi workspace, basis tanggal order, draft/applied, reset, serta respons usang. Tidak ada migrasi tambahan atau mutasi akun, saldo, maupun pembayaran nyata. Browser aplikasi dan build produksi belum diverifikasi; belum di-push. Notion belum diperbarui karena konektor tidak tersedia.

### Ekspor CSV riwayat detail akun (8 Oktober 2026)

- Setiap riwayat sesi, pembayaran, dan ledger menyediakan Ekspor CSV untuk seluruh hasil sesuai tanggal yang sudah diterapkan; draft tanggal dan pagination layar tidak mengubah cakupan file. Maksimal 5.000 entri, dengan instruksi mempersempit tanggal jika terlampaui. Filter/akun/workspace berubah membatalkan unduhan lama; error ekspor tampil terpisah dari error tabel.
- GET `/api/admin/backoffice?export=history-csv` memerlukan sesi aktif dan platform operator. Service memvalidasi UUID target/workspace, jenis riwayat dan kalender/rentang tanggal; repository memakai pemeriksaan membership serta hitungan/baris dari satu statement SQL. Fetch dibatasi 5.001 baris; snapshot tidak lengkap ditolak, bukan dipotong diam-diam.
- CSV menyertakan ringkasan cakupan/periode UTC, basis created_at, batas akhir eksklusif, jumlah entri, serta kolom riwayat yang diizinkan. Sesi milik akun di semua workspace; pembayaran/ledger milik workspace bersama. Nominal NUMERIC ditulis sebagai string tanpa konversi floating point; teks formula spreadsheet dinetralkan, quote/newline di-escape dan UTF-8 BOM disertakan. Token/hash/password, metadata ledger dan payment URL tidak diekspor.
- Respons attachment memakai private/no-store, Vary Cookie, text/csv dan nosniff. Client memakai sesi same-origin, memeriksa jenis respons, menghindari unduhan usang dan membersihkan object URL. Tidak ada migrasi atau mutasi akun/keuangan.
- Verifikasi: `node --test tests/admin/*.test.mjs tests/frontend/*.test.mjs tests/security/*.test.mjs` menghasilkan 147 lolos; integrasi PostgreSQL accountHistoryIntegration/backofficeIntegration menghasilkan 2 lolos tanpa skip (149 total). Mencakup ekspor lintas halaman, batas UTC, isolasi workspace, akses customer/anonymous, batas ukuran/snapshot, presisi CSV, formula, draft/applied, pembatalan dan error unduhan. `git diff --check` bersih. Browser aplikasi/build produksi belum diverifikasi; belum di-push. Notion tidak tersedia, dokumentasi disimpan lokal.

### Filter status dan aktivitas riwayat akun (8 Oktober 2026)

- Riwayat pembayaran menyediakan status Semua, Menunggu/pending, Selesai/completed, Dibatalkan/canceled, dan Gagal/failed. Aktivitas sesi menyediakan Semua, Sesi dibuat, atau Sesi dicabut. Ledger menyediakan pencarian alasan case-insensitive maksimal 120 karakter; `%`, `_`, dan backslash dicari secara literal.
- Semua kontrol memakai draft/applied yang sama dengan tanggal. Terapkan filter kembali ke halaman pertama; Reset filter menghapus tanggal serta status/aktivitas/pencarian. Tiap riwayat tetap independen. Pagination dan ekspor CSV mempertahankan filter yang diterapkan; perubahan filter membatalkan ekspor usang. Ringkasan layar dan kolom category_filter dalam CSV memperlihatkan cakupan aktif.
- GET backoffice meneruskan category ke service; validasi enum dan panjang/tipe dijalankan sebelum query serta digunakan kembali oleh repository. Kondisi kategori berada dalam CTE filtered bersama batas tanggal, sebelum count/pagination; nilai diikat sebagai parameter SQL. Tidak ada perubahan membership, saldo atau pembayaran.
- Verifikasi: 148 tes admin/frontend/security dan 2 integrasi PostgreSQL lolos tanpa skip (150 total). Mencakup status seluruh pembayaran, aktivitas akun yang dipilih, pencarian alasan literal/case-insensitive, gabungan tanggal+status, hasil kosong, pagination, ekspor seluruh hasil, draft/applied/reset serta penolakan customer/workspace lain. `git diff --check` bersih. Browser aplikasi/build produksi belum diverifikasi; belum di-push. Notion tidak tersedia, catatan disimpan lokal.
