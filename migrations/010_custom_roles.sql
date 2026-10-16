CREATE TABLE departments (
 id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL REFERENCES tenants(id),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,name)
);
INSERT INTO departments(tenant_id,name)
 SELECT id,value FROM tenants CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(settings->'departments','[]')) AS d(value)
 WHERE length(value) BETWEEN 1 AND 100 ON CONFLICT DO NOTHING;
CREATE TABLE workspace_roles (
 id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL REFERENCES tenants(id),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 base_role TEXT NOT NULL CHECK(base_role IN ('admin','manager','agent','client')),
 UNIQUE(tenant_id,name), UNIQUE(tenant_id,id,base_role)
);
INSERT INTO workspace_roles(tenant_id,name,base_role)
 SELECT t.id,r.name,r.base_role FROM tenants t CROSS JOIN (VALUES ('Admin','admin'),('Gerente','manager'),('Ingeniero','agent')) r(name,base_role);
ALTER TABLE users ADD COLUMN role_id INTEGER;
ALTER TABLE users ADD COLUMN department_id INTEGER;
ALTER TABLE users ADD COLUMN specialty TEXT NOT NULL DEFAULT '' CHECK(length(specialty)<=160);
ALTER TABLE users ADD FOREIGN KEY(tenant_id,role_id,role) REFERENCES workspace_roles(tenant_id,id,base_role);
ALTER TABLE users ADD FOREIGN KEY(tenant_id,department_id) REFERENCES departments(tenant_id,id);
ALTER TABLE invitations ADD COLUMN role_id INTEGER;
ALTER TABLE invitations ADD COLUMN department_id INTEGER;
ALTER TABLE invitations ADD COLUMN specialty TEXT NOT NULL DEFAULT '' CHECK(length(specialty)<=160);
ALTER TABLE invitations ADD FOREIGN KEY(tenant_id,role_id,role) REFERENCES workspace_roles(tenant_id,id,base_role);
ALTER TABLE invitations ADD FOREIGN KEY(tenant_id,department_id) REFERENCES departments(tenant_id,id);
ALTER TABLE tickets ADD COLUMN department_id INTEGER;
ALTER TABLE tickets ADD FOREIGN KEY(tenant_id,department_id) REFERENCES departments(tenant_id,id);
CREATE INDEX tickets_department_idx ON tickets(tenant_id,department_id);
ALTER TABLE ai_conversations ADD COLUMN access_scope TEXT NOT NULL DEFAULT 'global';

UPDATE ai_conversations c SET access_scope=CASE WHEN u.role='client' THEN 'client-'||u.company_id ELSE 'role-'||u.role END FROM users u WHERE u.id=c.user_id;
