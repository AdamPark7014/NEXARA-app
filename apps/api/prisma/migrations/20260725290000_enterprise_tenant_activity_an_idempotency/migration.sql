-- Per-tenant Activity.anNumber + IdempotencyKey scoped by companyId

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Activity_anNumber_key') THEN
    ALTER TABLE "Activity" DROP CONSTRAINT "Activity_anNumber_key";
  END IF;
END $$;

DROP INDEX IF EXISTS "Activity_anNumber_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Activity_companyId_anNumber_key"
  ON "Activity"("companyId", "anNumber");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'idempotency_keys_key_method_path_key') THEN
    ALTER TABLE "idempotency_keys" DROP CONSTRAINT "idempotency_keys_key_method_path_key";
  END IF;
END $$;

DROP INDEX IF EXISTS "idempotency_keys_key_method_path_key";

CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_keys_companyId_key_method_path_key"
  ON "idempotency_keys"("companyId", "key", "method", "path");
