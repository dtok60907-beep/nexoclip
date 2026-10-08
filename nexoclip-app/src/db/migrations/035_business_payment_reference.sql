-- A manual bank payment must not be reused for a different business workspace.
ALTER TABLE business_credit_orders DROP CONSTRAINT IF EXISTS business_credit_orders_workspace_id_payment_reference_key;
ALTER TABLE business_credit_orders ADD CONSTRAINT business_credit_orders_payment_reference_unique UNIQUE(payment_reference);
