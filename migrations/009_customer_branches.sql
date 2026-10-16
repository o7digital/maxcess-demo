-- Preserve legacy sites and historical tickets. New structured branches are optional.
CREATE TABLE customer_branches (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  company_id INTEGER NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  country_code TEXT NOT NULL CHECK(country_code ~ '^[A-Z]{2}$'),
  city TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL CHECK(language IN ('es','en','fr','pt')),
  timezone TEXT NOT NULL,
  UNIQUE(tenant_id,company_id,name),
  UNIQUE(tenant_id,company_id,id),
  FOREIGN KEY(tenant_id,company_id) REFERENCES companies(tenant_id,id)
);
ALTER TABLE tickets ADD COLUMN branch_id INTEGER;
ALTER TABLE tickets ADD FOREIGN KEY(tenant_id,company_id,branch_id)
  REFERENCES customer_branches(tenant_id,company_id,id);
CREATE INDEX tickets_branch_idx ON tickets(tenant_id,branch_id);
ALTER TABLE users ADD COLUMN language TEXT CHECK(language IN ('es','en','fr','pt'));
