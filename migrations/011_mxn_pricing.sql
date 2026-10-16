-- Existing Stripe prices/contracts are immutable; no charge or currency conversion is issued here.
ALTER TABLE billing_plans ADD COLUMN currency TEXT NOT NULL DEFAULT 'usd';
ALTER TABLE tenants ADD COLUMN billing_currency TEXT NOT NULL DEFAULT 'mxn';
ALTER TABLE tenants ADD COLUMN billing_model TEXT NOT NULL DEFAULT 'activation_mxn_v1';
ALTER TABLE tenants ADD COLUMN retired_subscription_ids TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE tenants ADD COLUMN activation_paid_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN checkout_total_cents INTEGER;
ALTER TABLE tenants ADD COLUMN checkout_activation_cents INTEGER;
UPDATE tenants SET billing_currency='usd',billing_model='legacy_usd_v1' WHERE stripe_subscription_id IS NOT NULL;
UPDATE billing_plans SET active=false WHERE seat_limit NOT IN (5,10,15,30,50);
INSERT INTO billing_plans(id,name,seat_limit,monthly_cents,currency,discounts,ai_limit,active,version) VALUES
 ('team-5','Plan 5',5,149900,'mxn','{"1":0,"3":5,"6":10,"12":16.666666666666668}',100,true,2),
 ('team-10','Plan 10',10,284810,'mxn','{"1":0,"3":5,"6":10,"12":16.666666666666668}',200,true,2),
 ('team-15','Plan 15',15,404730,'mxn','{"1":0,"3":5,"6":10,"12":16.666666666666668}',300,true,2),
 ('business-30','Plan 30',30,764490,'mxn','{"1":0,"3":5,"6":10,"12":16.666666666666668}',600,true,2),
 ('business-50','Plan 50',50,1199200,'mxn','{"1":0,"3":5,"6":10,"12":16.666666666666668}',1000,true,2)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,monthly_cents=excluded.monthly_cents,currency='mxn',discounts=excluded.discounts,ai_limit=excluded.ai_limit,active=true,version=billing_plans.version+1;
