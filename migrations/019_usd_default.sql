-- Keep an immutable reference to the preceding catalogue; never edit Stripe contracts.
CREATE TABLE billing_catalog_history (
 plan_id text NOT NULL, currency text NOT NULL, version integer NOT NULL,
 snapshot jsonb NOT NULL, archived_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(plan_id,currency,version)
);
INSERT INTO billing_catalog_history(plan_id,currency,version,snapshot)
SELECT id,currency,version,to_jsonb(p) FROM billing_plans p;
UPDATE billing_plans SET currency='usd',
 unit_cents=CASE id WHEN 'solo-2' THEN 2900 WHEN 'team-5' THEN 2400 WHEN 'team-15' THEN 1900 WHEN 'business-30' THEN 1200 END,
 monthly_cents=seat_limit*CASE id WHEN 'solo-2' THEN 2900 WHEN 'team-5' THEN 2400 WHEN 'team-15' THEN 1900 WHEN 'business-30' THEN 1200 END,
 version=version+1
WHERE active AND id IN ('solo-2','team-5','team-15','business-30');
ALTER TABLE tenants ALTER COLUMN billing_currency SET DEFAULT 'usd';
ALTER TABLE tenants ALTER COLUMN billing_model SET DEFAULT 'activation_usd_v1';
-- Existing customers, pending checkouts, invoices and paid entitlements retain their currency/model.
UPDATE tenants t SET billing_currency='usd',billing_model='activation_usd_v1'
WHERE billing_model='activation_mxn_v1' AND stripe_customer_id IS NULL AND stripe_subscription_id IS NULL
 AND checkout_session_id IS NULL AND activation_paid_at IS NULL AND monthly_recurring_cents=0
 AND NOT EXISTS(SELECT 1 FROM billing_invoices i WHERE i.tenant_id=t.id);
