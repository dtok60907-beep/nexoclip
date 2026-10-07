# Accounts and custom business credit billing

Implemented locally on 2026-10-07. The user's approval authorizes a platform-wide account directory and backoffice, extending the earlier workspace-only operator console. Notion tools are unavailable; product/task updates are recorded here instead. Existing unrelated work is preserved.

## Behavior

- `/admin/accounts`: searchable user directory including users without a workspace. Operators can open a workspace member profile containing account session events and user-owned generation jobs, shared workspace payments/credit ledger/credit lots/audit history, and workspace economics for the latest 30 UTC days. Directory returns 100 accounts per search; profile histories return latest 50, invoices latest 100.
- `/admin/billing`: immutable custom invoice terms (company/contact, purchased credits, bonus, IDR amount, notes). Credits do not expire in this implementation. Creating an invoice does not grant credits.
- Operator records an externally verified manual payment reference, payment time, and fee (blank remains unknown). Settlement atomically grants one paid credit lot and ledger entry, adds a completed `manual_business` top-up to existing transaction reports, settles the invoice, and appends the operator audit. The paid amount is spread over purchased plus bonus credits, preserving existing FIFO consumption/revenue attribution.
- Replaying or concurrently settling the same invoice cannot duplicate credits. A payment reference cannot settle another invoice, including a different workspace. Canceled invoices cannot settle; settled invoices cannot change.
- Trial/bonus/compensation grants require a reason and create zero-revenue promo credit lots with an operator audit. Paid grants must use invoice settlement.
- New database session triggers record creation/revocation from activation onward, including programmatic sessions. They do not record password/token/IP, unsuccessful login attempts, pageviews, or fabricate historical activity.

## Authorization and data boundary

The new `/api/admin/backoffice` authenticates the session and authorizes its actual user ID against server-only `NEXOCLIP_OPERATOR_USER_IDS` before any account queries or mutation. It intentionally permits those platform operators to administer all workspaces, as requested. Target contact must be a member of the exact target workspace. It does not grant global access to ordinary workspace admins or members; existing tenant APIs retain membership restrictions. POST requires a matching same-origin Origin and JSON body, capped at 12KB. Returned profile fields exclude session credentials, passwords, raw prompts, provider secrets, and arbitrary ledger metadata. Errors mask infrastructure/SQL details.

## Files

- Migrations `034_admin_business_billing.sql`, `035_business_payment_reference.sql`.
- `src/repositories/backofficeRepository.js`, `src/services/backofficeService.js`.
- `app/api/admin/backoffice/route.js`, Accounts/Billing server pages and authenticated `BackofficePage`.
- `BackofficeDashboard`, shared shell platform scope labels, navigation links.

## Verification

- Unit tests: unauthorized operator rejection, target membership, input/source validation, session-owned actor, CSRF rejection, masked server errors.
- Frontend test: escaped account text, shared workspace vs account activity, credit formatting, unknown contribution and explicit un-reconciled BytePlus costs.
- PostgreSQL integration: clean isolated schema, invoice replay and immutable terms, four concurrent settlements/grants, exact paid/promo lot values, duplicate transfer rollback in same/different workspace, canceled invoice denial, append-only audit, session lifecycle trigger, safe profile/directory fields. Fixture schema removed after each run; no real customer balances or orders changed.
- Local PostgreSQL is 14. Existing migration 006 uses a PG15-only column-specific `ON DELETE SET NULL`; only in the test fixture this is substituted with `RESTRICT`. New migrations 034/035 run unchanged. Therefore this is not a claim that all historical migrations run unmodified on PG14.
- Local migrations applied successfully. Root lint (limited syntax checks) and `git diff --check` passed. New service/repository/route syntax and JSX compilation passed.
- Browser: actual operator profile loaded (742.8 available, 0 reserved, 7.2 captured success and 6.3 released failure), whole-platform account directory visible. Business billing form loaded; unsaved example 100,000 credits / IDR15,000,000 displayed IDR150/credit. No real invoice/payment/grant submitted during UI verification.

## Limits

Manual bank payment verification is operator attestation, not bank/gateway confirmation. No email sending, PDF export, expiration, recurring subscription, refund execution, or BytePlus invoice reconciliation is included. Existing Economics is usage/rate-based when provider cost is calculated; invoice verification remains separate future work. No production deployment was performed.
