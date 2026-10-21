ALTER TABLE tenants ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '12 days');
-- Align standard unpaid trials to twelve days from creation; never restart a trial
-- or overwrite a manually adjusted deadline, a suspension or a paid subscription.
UPDATE tenants SET trial_ends_at=created_at+interval '12 days'
WHERE NOT is_demo AND status='trialing' AND stripe_subscription_id IS NULL
  AND trial_ends_at=created_at+interval '7 days';
