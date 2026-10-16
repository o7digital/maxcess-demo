ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
UPDATE users SET email_verified_at=now() WHERE tenant_id=1;
CREATE TABLE account_tokens (
 id BIGSERIAL PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE,
 purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')),
 expires_at TIMESTAMPTZ NOT NULL,
 consumed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tickets ADD COLUMN escalated_at TIMESTAMPTZ;
