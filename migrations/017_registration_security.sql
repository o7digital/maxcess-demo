ALTER TABLE users ADD COLUMN first_name text, ADD COLUMN last_name text, ADD COLUMN birth_date date, ADD COLUMN phone text;
ALTER TABLE tenants ADD COLUMN legal_name text, ADD COLUMN billing_address text, ADD COLUMN billing_country char(2), ADD COLUMN tax_id text;
CREATE TABLE user_mfa(user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, method text NOT NULL CHECK(method IN ('email','totp')), secret text, last_step bigint NOT NULL DEFAULT -1, recovery_hashes text[] NOT NULL DEFAULT '{}', enabled boolean NOT NULL DEFAULT false);
CREATE TABLE mfa_challenges(id uuid PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, purpose text NOT NULL CHECK(purpose IN ('login','setup','disable')), method text NOT NULL, code_hash text, expires_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0, consumed_at timestamptz);
CREATE INDEX mfa_challenge_expiry ON mfa_challenges(expires_at);
