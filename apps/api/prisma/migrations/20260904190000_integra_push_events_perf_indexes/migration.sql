-- Índices para sondeo afterId/beforeId y KPIs ACS (sin escanear VMD histórico).
CREATE INDEX IF NOT EXISTS "integra_push_events_companyId_id_idx"
  ON "integra_push_events"("companyId", "id");
CREATE INDEX IF NOT EXISTS "integra_push_events_siteId_id_idx"
  ON "integra_push_events"("siteId", "id");
CREATE INDEX IF NOT EXISTS "integra_push_events_companyId_major_occurredAt_idx"
  ON "integra_push_events"("companyId", "major", "occurredAt");
