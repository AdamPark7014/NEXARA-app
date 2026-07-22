-- Company API keys (inbound machine auth) + indexes

CREATE TABLE IF NOT EXISTS "company_api_keys" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "keyPrefix" VARCHAR(12) NOT NULL,
    "keyHash" VARCHAR(64) NOT NULL,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "company_api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_api_keys_keyHash_key" ON "company_api_keys"("keyHash");
CREATE INDEX IF NOT EXISTS "company_api_keys_companyId_isActive_idx" ON "company_api_keys"("companyId", "isActive");
CREATE INDEX IF NOT EXISTS "company_api_keys_keyPrefix_idx" ON "company_api_keys"("keyPrefix");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_api_keys_companyId_fkey') THEN
    ALTER TABLE "company_api_keys"
      ADD CONSTRAINT "company_api_keys_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_api_keys_createdById_fkey') THEN
    ALTER TABLE "company_api_keys"
      ADD CONSTRAINT "company_api_keys_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
