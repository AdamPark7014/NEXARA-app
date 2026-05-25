-- ============================================================================
-- FASE 34 — Multi-tenant base + Feature Flags persistidos
-- ============================================================================

-- ── CompanyProfile: campos para multi-tenant ──
ALTER TABLE "company_profile"
  ADD COLUMN IF NOT EXISTS "slug" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS "company_profile_slug_key" ON "company_profile"("slug");

-- ── Feature Flags ──
CREATE TABLE IF NOT EXISTS "feature_flags" (
  "id" SERIAL PRIMARY KEY,
  "key" VARCHAR(120) NOT NULL,
  "scope" VARCHAR(60) NOT NULL,
  "description" VARCHAR(500),
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "feature_flags_key_key" ON "feature_flags"("key");
CREATE INDEX IF NOT EXISTS "feature_flags_scope_idx" ON "feature_flags"("scope");

-- ── Seed inicial de flags conocidos ──
INSERT INTO "feature_flags" ("key", "scope", "description", "enabled")
VALUES
  ('lab.ai.live', 'lab', 'Conecta AI Sandbox a la API real (Claude/GPT)', false),
  ('noc.realtime.mqtt', 'noc', 'Streaming MQTT en NOC para telemetría en vivo', false),
  ('ventas.ai.lead-scoring', 'ventas', 'Lead scoring asistido por IA en CRM', true),
  ('ops.routes.auto-optimize', 'ops', 'Optimización automática de rutas con OR-Tools', false),
  ('finance.cfdi.auto-stamp', 'finance', 'Timbrado automático al crear factura', true),
  ('people.payroll.export-csv', 'people', 'Exportar nómina en CSV para SAT', true),
  ('core.workflow.slack-webhook', 'core', 'Notificar workflows aprobados/rechazados a Slack', false)
ON CONFLICT ("key") DO NOTHING;
