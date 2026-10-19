-- Operators can set a workspace's balance to a target (0 empties it). The ledger gets
-- the difference as an admin_adjustment entry and the audit trail a credit_adjusted event.
ALTER TABLE admin_account_events DROP CONSTRAINT IF EXISTS admin_account_events_action_check;
ALTER TABLE admin_account_events ADD CONSTRAINT admin_account_events_action_check
  CHECK (action IN ('invoice_created','invoice_paid','invoice_canceled','credit_granted','credit_adjusted'));
