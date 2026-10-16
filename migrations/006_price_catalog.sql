CREATE TABLE stripe_price_catalog (
 catalog_key TEXT PRIMARY KEY,
 stripe_price_id TEXT NOT NULL UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
