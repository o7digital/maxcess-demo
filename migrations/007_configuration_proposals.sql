ALTER TABLE tenants ADD COLUMN configuration_version INTEGER NOT NULL DEFAULT 1;
CREATE TABLE configuration_proposals (
 id UUID PRIMARY KEY,
 tenant_id INTEGER NOT NULL REFERENCES tenants(id),
 actor_id INTEGER NOT NULL,
 base_version INTEGER NOT NULL,
 settings JSONB NOT NULL,
 applied_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES users(tenant_id,id)
);
