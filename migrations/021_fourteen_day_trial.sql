ALTER TABLE tenants ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '14 days');
-- Extend standard unpaid trials from their original start; preserve custom dates,
-- suspensions and financially committed subscriptions.
UPDATE tenants SET trial_ends_at=created_at+interval '14 days'
WHERE NOT is_demo AND status='trialing' AND stripe_subscription_id IS NULL
  AND trial_ends_at=created_at+interval '12 days';
