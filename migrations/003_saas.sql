-- Existing data stays in an explicitly isolated illustrative workspace.
CREATE TABLE tenants (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing','active','past_due','suspended','canceled')),
  trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
  grace_ends_at TIMESTAMPTZ,
  seat_limit INTEGER NOT NULL DEFAULT 5 CHECK (seat_limit BETWEEN 1 AND 10000),
  ai_limit INTEGER NOT NULL DEFAULT 50 CHECK (ai_limit >= 0),
  settings JSONB NOT NULL DEFAULT '{}',
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  billing_plan_id TEXT,
  billing_months INTEGER CHECK (billing_months IN (1,3,6,12)),
  billing_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  checkout_session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO tenants(name,is_demo,status,seat_limit,ai_limit,onboarding_completed) VALUES ('Espacio ilustrativo',true,'active',100,1000,true);
ALTER TABLE companies ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id);
ALTER TABLE users ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id);
ALTER TABLE tickets ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id);
ALTER TABLE contacts ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id);
ALTER TABLE events ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id);
ALTER TABLE reports ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id);
ALTER TABLE ai_conversations ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id);
ALTER TABLE ai_messages ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id);
ALTER TABLE user_audit ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id);
ALTER TABLE users ADD COLUMN is_platform_owner BOOLEAN NOT NULL DEFAULT false;
UPDATE users SET is_platform_owner=true WHERE role='platform_admin' AND email='olivier.steineur@o7digitalgroup.com';
ALTER TABLE companies DROP CONSTRAINT companies_name_key;
ALTER TABLE companies ADD UNIQUE(tenant_id,name);
ALTER TABLE companies ADD UNIQUE(tenant_id,id);
ALTER TABLE users ADD UNIQUE(tenant_id,id);
CREATE UNIQUE INDEX users_email_lower ON users(lower(email));
ALTER TABLE contacts DROP CONSTRAINT contacts_email_key;
ALTER TABLE contacts ADD UNIQUE(tenant_id,email);
ALTER TABLE users ADD FOREIGN KEY(tenant_id,company_id) REFERENCES companies(tenant_id,id);
ALTER TABLE contacts ADD FOREIGN KEY(tenant_id,company_id) REFERENCES companies(tenant_id,id);
ALTER TABLE tickets ADD UNIQUE(tenant_id,id);
ALTER TABLE tickets ADD FOREIGN KEY(tenant_id,company_id) REFERENCES companies(tenant_id,id);
ALTER TABLE tickets ADD FOREIGN KEY(tenant_id,agent_id) REFERENCES users(tenant_id,id);
ALTER TABLE tickets ADD FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id);
ALTER TABLE events ADD FOREIGN KEY(tenant_id,ticket_id) REFERENCES tickets(tenant_id,id);
ALTER TABLE events ADD FOREIGN KEY(tenant_id,actor_id) REFERENCES users(tenant_id,id);
ALTER TABLE reports ADD FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id);
ALTER TABLE ai_conversations ADD UNIQUE(tenant_id,id);
ALTER TABLE ai_conversations ADD FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id);
ALTER TABLE ai_messages ADD FOREIGN KEY(tenant_id,conversation_id) REFERENCES ai_conversations(tenant_id,id);
ALTER TABLE user_audit ADD FOREIGN KEY(tenant_id,actor_id) REFERENCES users(tenant_id,id);
ALTER TABLE user_audit ADD FOREIGN KEY(tenant_id,subject_id) REFERENCES users(tenant_id,id);
ALTER TABLE tickets DROP CONSTRAINT tickets_category_check;
ALTER TABLE tickets ADD COLUMN custom_fields JSONB NOT NULL DEFAULT '{}';
ALTER TABLE tickets ADD COLUMN workflow_stage TEXT;
CREATE INDEX tickets_tenant_created ON tickets(tenant_id,created_at DESC,id DESC);
CREATE INDEX users_tenant ON users(tenant_id);
CREATE TABLE teams (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL REFERENCES tenants(id), name TEXT NOT NULL, UNIQUE(tenant_id,name), UNIQUE(tenant_id,id));
ALTER TABLE users ADD COLUMN team_id INTEGER;
ALTER TABLE users ADD FOREIGN KEY(tenant_id,team_id) REFERENCES teams(tenant_id,id);
CREATE TABLE invitations (id UUID PRIMARY KEY, tenant_id INTEGER NOT NULL REFERENCES tenants(id), email TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','manager','agent','client')), company_id INTEGER, team_id INTEGER, token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '72 hours', accepted_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), FOREIGN KEY(tenant_id,company_id) REFERENCES companies(tenant_id,id), FOREIGN KEY(tenant_id,team_id) REFERENCES teams(tenant_id,id));
CREATE UNIQUE INDEX invitations_pending ON invitations(tenant_id,lower(email)) WHERE accepted_at IS NULL;
CREATE TABLE billing_plans (id TEXT PRIMARY KEY, name TEXT NOT NULL, seat_limit INTEGER NOT NULL UNIQUE, monthly_cents INTEGER CHECK(monthly_cents>0), discounts JSONB NOT NULL DEFAULT '{"1":0,"3":0,"6":0,"12":0}', ai_limit INTEGER NOT NULL DEFAULT 100 CHECK(ai_limit>=0), active BOOLEAN NOT NULL DEFAULT true, version INTEGER NOT NULL DEFAULT 1);
INSERT INTO billing_plans(id,name,seat_limit) VALUES ('team-5','Team 5',5),('team-10','Team 10',10),('business-25','Business 25',25),('business-50','Business 50',50);
CREATE TABLE billing_events (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, processed_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE billing_invoices (id TEXT PRIMARY KEY, tenant_id INTEGER NOT NULL REFERENCES tenants(id), status TEXT NOT NULL, amount_paid INTEGER NOT NULL, currency TEXT NOT NULL, hosted_url TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE ai_usage (tenant_id INTEGER NOT NULL REFERENCES tenants(id), period DATE NOT NULL DEFAULT date_trunc('month',now())::date, used INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(tenant_id,period));
CREATE TABLE notification_outbox (id BIGSERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL REFERENCES tenants(id), dedupe_key TEXT NOT NULL UNIQUE, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, available_at TIMESTAMPTZ NOT NULL DEFAULT now(), sent_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE workspace_audit (id BIGSERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL REFERENCES tenants(id), actor_id INTEGER REFERENCES users(id), action TEXT NOT NULL, details JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE configuration_templates (id TEXT PRIMARY KEY, name TEXT NOT NULL, settings JSONB NOT NULL, active BOOLEAN NOT NULL DEFAULT true);
INSERT INTO configuration_templates(id,name,settings) VALUES
 ('service','Servicio posventa','{"categories":["Servicio","Equipos","Facturación"],"departments":["Atención al cliente","Servicio técnico"]}'),
 ('it','Soporte informático','{"categories":["Conectividad","Equipos","Accesos"],"departments":["Mesa de ayuda","Infraestructura"]}'),
 ('maintenance','Mantenimiento','{"categories":["Preventivo","Correctivo","Inspección"],"departments":["Operaciones","Mantenimiento"]}'),
 ('center','Centro de servicios','{"categories":["Servicio","Accesos","Facturación"],"departments":["Atención","Operaciones"]}'),
 ('custom','Personalizado','{"categories":["Servicio"],"departments":[]}');
