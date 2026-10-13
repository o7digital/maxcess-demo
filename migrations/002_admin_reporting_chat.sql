ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('platform_admin','admin','manager','agent','client'));
ALTER TABLE users ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;
UPDATE users SET role='platform_admin' WHERE email='olivier.steineur@o7digitalgroup.com' AND role='manager';
CREATE TABLE reports (id UUID PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), filters JSONB NOT NULL, snapshot JSONB NOT NULL, narrative TEXT, provider TEXT NOT NULL DEFAULT 'database', created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE ai_conversations (id UUID PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), upstream_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE ai_messages (id BIGSERIAL PRIMARY KEY, conversation_id UUID NOT NULL REFERENCES ai_conversations(id), role TEXT NOT NULL CHECK(role IN ('user','assistant')), body TEXT NOT NULL, mode TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX ai_conversations_owner ON ai_conversations(user_id);
CREATE TABLE user_audit (id BIGSERIAL PRIMARY KEY, actor_id INTEGER NOT NULL REFERENCES users(id), subject_id INTEGER NOT NULL REFERENCES users(id), action TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
