-- Cola SOC ACS desde push (denegado / fuera de horario) + política por sitio.

ALTER TABLE "integra_sites"
  ADD COLUMN IF NOT EXISTS "alarmPolicy" JSONB;

CREATE TABLE IF NOT EXISTS "integra_soc_alarms" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "siteId" INTEGER NOT NULL,
  "kind" VARCHAR(24) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  "fingerprint" VARCHAR(180) NOT NULL,
  "title" VARCHAR(280) NOT NULL,
  "severity" VARCHAR(40) NOT NULL DEFAULT 'alta',
  "personId" VARCHAR(64),
  "personName" VARCHAR(220),
  "doorNo" INTEGER,
  "doorName" VARCHAR(220),
  "deviceIp" VARCHAR(64),
  "deviceName" VARCHAR(220),
  "photoPath" VARCHAR(300),
  "pushEventId" INTEGER,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "firstOccurredAt" TIMESTAMP(3) NOT NULL,
  "lastOccurredAt" TIMESTAMP(3) NOT NULL,
  "ticketRequestId" INTEGER,
  "escalatedAt" TIMESTAMP(3),
  "note" TEXT,
  "userId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "integra_soc_alarms_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "integra_soc_alarms_siteId_status_lastOccurredAt_idx"
  ON "integra_soc_alarms"("siteId", "status", "lastOccurredAt");
CREATE INDEX IF NOT EXISTS "integra_soc_alarms_siteId_fingerprint_status_idx"
  ON "integra_soc_alarms"("siteId", "fingerprint", "status");
CREATE INDEX IF NOT EXISTS "integra_soc_alarms_companyId_status_idx"
  ON "integra_soc_alarms"("companyId", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'integra_soc_alarms_companyId_fkey'
  ) THEN
    ALTER TABLE "integra_soc_alarms"
      ADD CONSTRAINT "integra_soc_alarms_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'integra_soc_alarms_siteId_fkey'
  ) THEN
    ALTER TABLE "integra_soc_alarms"
      ADD CONSTRAINT "integra_soc_alarms_siteId_fkey"
      FOREIGN KEY ("siteId") REFERENCES "integra_sites"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
