CREATE TABLE workspace_logos (
  id UUID PRIMARY KEY,
  tenant_id INTEGER NOT NULL UNIQUE REFERENCES tenants(id),
  image BYTEA NOT NULL CHECK(octet_length(image)<=1000000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
