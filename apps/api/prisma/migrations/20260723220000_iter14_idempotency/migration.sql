-- Iter 14: Idempotency-Key store

CREATE TABLE IF NOT EXISTS "idempotency_keys" (
  "id" SERIAL PRIMARY KEY,
  "key" VARCHAR(120) NOT NULL,
  "companyId" INTEGER,
  "userId" INTEGER,
  "method" VARCHAR(10) NOT NULL,
  "path" VARCHAR(300) NOT NULL,
  "requestHash" VARCHAR(64),
  "statusCode" INTEGER NOT NULL,
  "responseBody" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_keys_key_method_path_key"
  ON "idempotency_keys"("key", "method", "path");
CREATE INDEX IF NOT EXISTS "idempotency_keys_expiresAt_idx" ON "idempotency_keys"("expiresAt");
CREATE INDEX IF NOT EXISTS "idempotency_keys_companyId_idx" ON "idempotency_keys"("companyId");

DO $$ BEGIN
  ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
