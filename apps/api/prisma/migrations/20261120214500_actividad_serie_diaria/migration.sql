-- Serie diaria de actividades (día N de M). Aditiva; no migra datos.
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "serieClave" VARCHAR(40);
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "serieDia" INTEGER;
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "serieTotal" INTEGER;
CREATE INDEX IF NOT EXISTS "Activity_serieClave_idx" ON "Activity"("serieClave");