-- Preserve the provider allowance and all existing accounting, but reserve
-- 0.5 decimal GB. Inventory and deletion must still work above this ceiling.
DROP TRIGGER storage_reservation_guard;
CREATE TRIGGER storage_reservation_guard BEFORE INSERT ON storage_objects
WHEN NEW.state = 'reserved' AND NOT EXISTS (
  SELECT 1 FROM storage_quota WHERE id = 1 AND initialized = 1
    AND NEW.size <= MIN(limit_bytes, 9500000000) - charged_bytes
)
BEGIN
  SELECT RAISE(ABORT, 'VAULT_STORAGE_LIMIT');
END;
