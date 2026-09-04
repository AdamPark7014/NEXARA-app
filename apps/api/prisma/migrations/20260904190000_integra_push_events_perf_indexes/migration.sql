-- Índices para sondeo afterId/beforeId, KPIs ACS y filtro por eventType.
CREATE INDEX IF NOT EXISTS "integra_push_events_companyId_id_idx"
  ON "integra_push_events"("companyId", "id");
CREATE INDEX IF NOT EXISTS "integra_push_events_siteId_id_idx"
  ON "integra_push_events"("siteId", "id");
CREATE INDEX IF NOT EXISTS "integra_push_events_companyId_major_occurredAt_idx"
  ON "integra_push_events"("companyId", "major", "occurredAt");
CREATE INDEX IF NOT EXISTS "integra_push_events_siteId_major_occurredAt_idx"
  ON "integra_push_events"("siteId", "major", "occurredAt");
CREATE INDEX IF NOT EXISTS "integra_push_events_siteId_eventType_occurredAt_idx"
  ON "integra_push_events"("siteId", "eventType", "occurredAt");
