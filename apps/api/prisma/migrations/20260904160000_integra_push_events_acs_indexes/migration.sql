-- Índices para listados ACS de negocio (accesos concedidos/denegados) y
-- sondeo incremental por id. El filtro por defecto de Eventos es major=5.
CREATE INDEX IF NOT EXISTS "integra_push_events_companyId_major_occurredAt_idx"
  ON "integra_push_events"("companyId", "major", "occurredAt");

CREATE INDEX IF NOT EXISTS "integra_push_events_siteId_major_occurredAt_idx"
  ON "integra_push_events"("siteId", "major", "occurredAt");

CREATE INDEX IF NOT EXISTS "integra_push_events_companyId_id_idx"
  ON "integra_push_events"("companyId", "id");

CREATE INDEX IF NOT EXISTS "integra_push_events_siteId_eventType_occurredAt_idx"
  ON "integra_push_events"("siteId", "eventType", "occurredAt");
