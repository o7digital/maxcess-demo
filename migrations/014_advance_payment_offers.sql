-- Applies to new quotes and explicit plan changes; existing Stripe contracts remain unchanged.
UPDATE billing_plans SET discounts='{"1":0,"3":7.5,"6":12.5,"12":16.666666666666668}',version=version+1
WHERE active AND currency='mxn' AND unit_cents IS NOT NULL;
