-- Illustrative SQL schema for the product catalog. The demo runtime
-- uses products.json; production would migrate to this shape.
CREATE TABLE IF NOT EXISTS products (
  id              VARCHAR(64)  PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  price_usd       BIGINT       NOT NULL,
  currency_code   VARCHAR(8)   NOT NULL DEFAULT 'USD',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
