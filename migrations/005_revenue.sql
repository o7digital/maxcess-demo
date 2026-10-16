ALTER TABLE tenants ADD COLUMN monthly_recurring_cents INTEGER NOT NULL DEFAULT 0 CHECK(monthly_recurring_cents>=0);
CREATE INDEX tickets_due_automation ON tickets(tenant_id,due_at) WHERE status IN ('Abierto','En curso') AND escalated_at IS NULL;
