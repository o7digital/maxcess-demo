-- Archive the preceding catalogue; never change existing Stripe contracts.
INSERT INTO billing_catalog_history(plan_id,currency,version,snapshot)
SELECT id,currency,version,to_jsonb(p) FROM billing_plans p
ON CONFLICT DO NOTHING;
UPDATE billing_plans SET active=false WHERE active;
INSERT INTO billing_plans(id,name,seat_limit,monthly_cents,currency,discounts,ai_limit,active,version,min_seats,max_seats,unit_cents)
VALUES ('agents','Service Hub',1,1399,'usd','{"1":0,"3":7.5,"6":12.5,"12":16.666666666666668}',20,true,1,1,10000,1399);
ALTER TABLE tenants ADD COLUMN activation_waived_at timestamptz;
ALTER TABLE tenants ALTER COLUMN billing_model SET DEFAULT 'activation_usd_agents_v2';
-- Only untouched unpaid workspaces adopt the new offer automatically.
UPDATE tenants t SET billing_model='activation_usd_agents_v2'
WHERE NOT is_demo AND billing_model='activation_usd_v1' AND status='trialing'
 AND stripe_customer_id IS NULL AND stripe_subscription_id IS NULL
 AND checkout_session_id IS NULL AND activation_paid_at IS NULL
 AND monthly_recurring_cents=0
 AND NOT EXISTS(SELECT 1 FROM billing_invoices i WHERE i.tenant_id=t.id);
