-- Immutable history and a new Stripe price version preserve existing contracts.
INSERT INTO billing_catalog_history(plan_id,currency,version,snapshot)
SELECT id,currency,version,to_jsonb(p) FROM billing_plans p WHERE id='agents'
ON CONFLICT DO NOTHING;
UPDATE billing_plans SET monthly_cents=1800,unit_cents=1800,version=version+1 WHERE id='agents';
ALTER TABLE tenants ALTER COLUMN billing_model SET DEFAULT 'activation_usd_agents_v3';
UPDATE tenants t SET billing_model='activation_usd_agents_v3'
WHERE NOT is_demo AND billing_model='activation_usd_agents_v2' AND status='trialing'
 AND stripe_customer_id IS NULL AND stripe_subscription_id IS NULL
 AND checkout_session_id IS NULL AND activation_paid_at IS NULL AND activation_waived_at IS NULL
 AND monthly_recurring_cents=0
 AND NOT EXISTS(SELECT 1 FROM billing_invoices i WHERE i.tenant_id=t.id);
