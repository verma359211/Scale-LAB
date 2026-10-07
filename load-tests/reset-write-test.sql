DELETE FROM orders
WHERE product_id IN (
  SELECT id FROM products WHERE is_benchmark = TRUE
);

UPDATE products
SET stock = 10000000
WHERE is_benchmark = TRUE;
