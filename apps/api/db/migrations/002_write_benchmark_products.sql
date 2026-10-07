ALTER TABLE products
ADD COLUMN is_benchmark BOOLEAN NOT NULL DEFAULT FALSE;

-- These products are reserved for repeatable write-load experiments. They are
-- addressable by ID but excluded from the customer-facing product list.
INSERT INTO products (id, name, description, price, stock, is_benchmark)
SELECT
  product_id,
  'Write benchmark product ' || product_id,
  'Reserved for ScaleLab write-load experiments.',
  10.00,
  10000000,
  TRUE
FROM generate_series(10001, 10100) AS product_id;
