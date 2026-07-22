-- Iter 9: tenant scope CRM/warehouse/tickets + OIDC + billing + audit enrichment

-- User OIDC link
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "oidcProvider" VARCHAR(40);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "oidcSubject" VARCHAR(190);
CREATE UNIQUE INDEX IF NOT EXISTS "User_oidcProvider_oidcSubject_key"
  ON "User"("oidcProvider", "oidcSubject")
  WHERE "oidcProvider" IS NOT NULL AND "oidcSubject" IS NOT NULL;

-- Company billing / plan
ALTER TABLE "company_profile" ADD COLUMN IF NOT EXISTS "planCode" VARCHAR(40) NOT NULL DEFAULT 'enterprise';
ALTER TABLE "company_profile" ADD COLUMN IF NOT EXISTS "seatLimit" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "company_profile" ADD COLUMN IF NOT EXISTS "billingStatus" VARCHAR(30) NOT NULL DEFAULT 'active';
ALTER TABLE "company_profile" ADD COLUMN IF NOT EXISTS "stripeCustomerId" VARCHAR(80);
ALTER TABLE "company_profile" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);

-- Scope high-value domain models
ALTER TABLE "sales_opportunities" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "client_ticket_requests" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

-- Audit enrichment
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "source" VARCHAR(30) NOT NULL DEFAULT 'http';

-- Backfill primary company
UPDATE "sales_opportunities" SET "companyId" = (
  SELECT id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1
) WHERE "companyId" IS NULL;

UPDATE "warehouses" SET "companyId" = (
  SELECT id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1
) WHERE "companyId" IS NULL;

UPDATE "client_ticket_requests" SET "companyId" = (
  SELECT id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1
) WHERE "companyId" IS NULL;

CREATE INDEX IF NOT EXISTS "sales_opportunities_companyId_idx" ON "sales_opportunities"("companyId");
CREATE INDEX IF NOT EXISTS "warehouses_companyId_idx" ON "warehouses"("companyId");
CREATE INDEX IF NOT EXISTS "client_ticket_requests_companyId_idx" ON "client_ticket_requests"("companyId");
CREATE INDEX IF NOT EXISTS "audit_logs_companyId_idx" ON "audit_logs"("companyId");
CREATE INDEX IF NOT EXISTS "audit_logs_source_idx" ON "audit_logs"("source");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_opportunities_companyId_fkey') THEN
    ALTER TABLE "sales_opportunities"
      ADD CONSTRAINT "sales_opportunities_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouses_companyId_fkey') THEN
    ALTER TABLE "warehouses"
      ADD CONSTRAINT "warehouses_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_ticket_requests_companyId_fkey') THEN
    ALTER TABLE "client_ticket_requests"
      ADD CONSTRAINT "client_ticket_requests_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_companyId_fkey') THEN
    ALTER TABLE "audit_logs"
      ADD CONSTRAINT "audit_logs_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Usage metering events
CREATE TABLE IF NOT EXISTS "company_usage_events" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "metric" VARCHAR(60) NOT NULL,
    "quantity" DECIMAL(16,4) NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_usage_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "company_usage_events_companyId_metric_occurredAt_idx"
  ON "company_usage_events"("companyId", "metric", "occurredAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_usage_events_companyId_fkey') THEN
    ALTER TABLE "company_usage_events"
      ADD CONSTRAINT "company_usage_events_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Deferred module flags (theater off by default)
INSERT INTO "feature_flags" ("key", "scope", "enabled", "description", "createdAt", "updatedAt")
SELECT 'module.mrp', 'product', false, 'DEFERRED P2 — MRP schema theater, no product surface', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "feature_flags" WHERE "key" = 'module.mrp');

INSERT INTO "feature_flags" ("key", "scope", "enabled", "description", "createdAt", "updatedAt")
SELECT 'module.quality', 'product', false, 'DEFERRED P2 — Quality schema theater', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "feature_flags" WHERE "key" = 'module.quality');

INSERT INTO "feature_flags" ("key", "scope", "enabled", "description", "createdAt", "updatedAt")
SELECT 'module.hse', 'product', false, 'DEFERRED P2 — HSE schema theater', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "feature_flags" WHERE "key" = 'module.hse');
