-- Seed migrations are identical on every new shard. This final migration
-- keeps only the product partition owned by the current shard. The API sets
-- these session values before running migrations.
DELETE FROM orders
WHERE MOD(product_id, current_setting('scalelab.shard_count')::INTEGER)
  <> current_setting('scalelab.shard_index')::INTEGER;

DELETE FROM products
WHERE MOD(id, current_setting('scalelab.shard_count')::INTEGER)
  <> current_setting('scalelab.shard_index')::INTEGER;
