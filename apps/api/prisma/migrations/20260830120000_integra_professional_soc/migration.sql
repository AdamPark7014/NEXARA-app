-- Integra Professional SOC: alarm ack, door region, floorplans

ALTER TABLE "integra_doors" ADD COLUMN IF NOT EXISTS "regionIndexCode" VARCHAR(120);

CREATE TABLE IF NOT EXISTS "integra_alarm_acks" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "externalAlarmId" VARCHAR(220) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACK',
    "note" TEXT,
    "userId" INTEGER,
    "severity" VARCHAR(40),
    "title" VARCHAR(280),
    "raw" JSONB,
    "ackedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integra_alarm_acks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "integra_alarm_acks_siteId_externalAlarmId_key"
  ON "integra_alarm_acks"("siteId", "externalAlarmId");
CREATE INDEX IF NOT EXISTS "integra_alarm_acks_companyId_status_idx"
  ON "integra_alarm_acks"("companyId", "status");

ALTER TABLE "integra_alarm_acks"
  ADD CONSTRAINT "integra_alarm_acks_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integra_alarm_acks"
  ADD CONSTRAINT "integra_alarm_acks_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "integra_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "integra_floorplans" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "imageData" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integra_floorplans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "integra_floorplans_siteId_idx" ON "integra_floorplans"("siteId");
CREATE INDEX IF NOT EXISTS "integra_floorplans_companyId_idx" ON "integra_floorplans"("companyId");

ALTER TABLE "integra_floorplans"
  ADD CONSTRAINT "integra_floorplans_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integra_floorplans"
  ADD CONSTRAINT "integra_floorplans_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "integra_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "integra_map_pins" (
    "id" SERIAL NOT NULL,
    "floorplanId" INTEGER NOT NULL,
    "entityType" VARCHAR(16) NOT NULL,
    "entityId" VARCHAR(120) NOT NULL,
    "label" VARCHAR(220),
    "xPct" DOUBLE PRECISION NOT NULL,
    "yPct" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integra_map_pins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "integra_map_pins_floorplanId_entityType_entityId_key"
  ON "integra_map_pins"("floorplanId", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS "integra_map_pins_floorplanId_idx" ON "integra_map_pins"("floorplanId");

ALTER TABLE "integra_map_pins"
  ADD CONSTRAINT "integra_map_pins_floorplanId_fkey"
  FOREIGN KEY ("floorplanId") REFERENCES "integra_floorplans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
