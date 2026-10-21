CREATE TABLE ticket_attachments (
  id UUID PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  data BYTEA NOT NULL CHECK(octet_length(data) BETWEEN 1 AND 2097152),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ticket_attachments_ticket ON ticket_attachments(tenant_id,ticket_id);
