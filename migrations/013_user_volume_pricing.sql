ALTER TABLE billing_plans ADD COLUMN min_seats INTEGER;
ALTER TABLE billing_plans ADD COLUMN max_seats INTEGER;
ALTER TABLE billing_plans ADD COLUMN unit_cents INTEGER;
UPDATE billing_plans SET active=false;
INSERT INTO billing_plans(id,name,seat_limit,monthly_cents,currency,discounts,ai_limit,active,version,min_seats,max_seats,unit_cents) VALUES
('solo-2','1–2 usuarios',2,99800,'mxn','{"1":0,"3":3,"6":7.5,"12":18}',40,true,3,1,2,49900),
('team-5','3–10 usuarios',5,199500,'mxn','{"1":0,"3":3,"6":7.5,"12":18}',100,true,3,3,10,39900),
('team-15','11–20 usuarios',15,448500,'mxn','{"1":0,"3":3,"6":7.5,"12":18}',300,true,3,11,20,29900),
('business-30','21+ usuarios',30,597000,'mxn','{"1":0,"3":3,"6":7.5,"12":18}',600,true,3,21,10000,19900)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,seat_limit=excluded.seat_limit,monthly_cents=excluded.monthly_cents,currency=excluded.currency,discounts=excluded.discounts,ai_limit=excluded.ai_limit,active=true,version=billing_plans.version+1,min_seats=excluded.min_seats,max_seats=excluded.max_seats,unit_cents=excluded.unit_cents;
-- Existing Stripe subscriptions retain their contracted prices and limits.
