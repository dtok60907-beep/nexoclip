# Trial revenue simulation

User approved applying the Starter price assumption of IDR149,000 for the earlier 750-credit trial grant. Implemented as an append-only reporting assumption in migration 036, attached only to that original promo credit lot via workspace+lot FK. Actual ledger, promo source type, purchase value, and balance remain unchanged; no fake top-up/payment was created.

Original local grant identified by `operator-local-test-grant-750-2026-10-07` in NexoClip Admin workspace. The assumption records actor, creation time, amount, original credit quantity, and reason. A trigger requires a promo lot with matching granted credits and prohibits updates/deletes. Consumed, finalized credit allocations determine simulated revenue; released reservations and unspent credits contribute no simulated revenue. Other promo lots retain zero revenue.

Economics returns actual recognized revenue separately from simulation. UI displays an explicit trial simulation banner, actual revenue, simulated consumed-credit revenue, and known-cost provisional simulated contribution. Incomplete provider/fee/revenue coverage still blocks final contribution and margin. Per-model/job rows label revenue as simulated where applicable; account profile reflects the same distinction.

Verified local result: actual recognized revenue IDR0; 7.2 consumed trial credits => simulated revenue IDR1430.4; provider cost IDR805.58819; known simulated contribution IDR624.81181. One failed provider request still has unknown cost, so final aggregate contribution and margin remain incomplete. Balance unchanged at 742.8 credits. Provider costs remain unreconciled with BytePlus invoices.

Verification: focused service/frontend tests passed; seven isolated PostgreSQL economics integration tests passed including specific-lot simulation and exclusion of unrelated promo lots. Browser confirms Economics shows simulated revenue Rp1,430 and provisional contribution Rp625 with clear incomplete coverage. Root limited syntax lint and diff whitespace checks passed. Local migration applied; no production deployment.
