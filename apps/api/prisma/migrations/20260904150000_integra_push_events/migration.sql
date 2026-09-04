-- Eventos que el equipo empuja a NEXARA, y el token con el que se identifica.
ALTER TABLE "integra_sites" ADD COLUMN "pushTokenHash" VARCHAR(64);
ALTER TABLE "integra_sites" ADD COLUMN "pushTokenAt" TIMESTAMP(3);

CREATE TABLE "integra_push_events" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "deviceIp" VARCHAR(64) NOT NULL,
    "deviceName" VARCHAR(220),
    "eventType" VARCHAR(64) NOT NULL,
    "major" INTEGER,
    "minor" INTEGER,
    "label" VARCHAR(160),
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "personId" VARCHAR(64),
    "personName" VARCHAR(220),
    "doorNo" INTEGER,
    "verifyMode" VARCHAR(64),
    "photoPath" VARCHAR(300),
    "targets" JSONB,
    "raw" JSONB,
    CONSTRAINT "integra_push_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "integra_push_events_siteId_occurredAt_idx" ON "integra_push_events"("siteId", "occurredAt");
CREATE INDEX "integra_push_events_siteId_personId_occurredAt_idx" ON "integra_push_events"("siteId", "personId", "occurredAt");
CREATE INDEX "integra_push_events_companyId_occurredAt_idx" ON "integra_push_events"("companyId", "occurredAt");

ALTER TABLE "integra_push_events" ADD CONSTRAINT "integra_push_events_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integra_push_events" ADD CONSTRAINT "integra_push_events_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "integra_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
