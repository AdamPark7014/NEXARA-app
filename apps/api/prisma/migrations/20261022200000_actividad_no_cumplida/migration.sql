-- Actividades no cumplidas.
--
-- Regla de Adam (22-10-2026): «cualquier actividad que no se acabe después de la jornada laboral se
-- toma como incumplida», y un superior puede registrar que una actividad no se cumplió.
-- Registro formal por incumplimiento + marca del aviso previo al cierre de jornada.
--
-- Aditiva: una tabla y una columna nuevas con sus índices y llaves. Sin DROP, RENAME ni UPDATE.
-- Idempotente.

ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "cierreAvisadoAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "activity_non_compliances" (
    "id" SERIAL NOT NULL,
    "activityId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "origen" VARCHAR(20) NOT NULL,
    "causa" VARCHAR(30) NOT NULL,
    "observaciones" TEXT,
    "limite" TIMESTAMP(3),
    "estatusPrevio" VARCHAR(50) NOT NULL,
    "pendientesIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "registradoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registradoPorId" INTEGER,
    "reprogramadaAt" TIMESTAMP(3),
    "reprogramadaPorId" INTEGER,
    "reprogramadaPara" TIMESTAMP(3),
    "motivoReprogramacion" VARCHAR(500),

    CONSTRAINT "activity_non_compliances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "activity_non_compliances_activityId_idx" ON "activity_non_compliances"("activityId");
CREATE INDEX IF NOT EXISTS "activity_non_compliances_companyId_registradoAt_idx" ON "activity_non_compliances"("companyId", "registradoAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_non_compliances_activityId_fkey') THEN
    ALTER TABLE "activity_non_compliances" ADD CONSTRAINT "activity_non_compliances_activityId_fkey"
      FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_non_compliances_companyId_fkey') THEN
    ALTER TABLE "activity_non_compliances" ADD CONSTRAINT "activity_non_compliances_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_non_compliances_registradoPorId_fkey') THEN
    ALTER TABLE "activity_non_compliances" ADD CONSTRAINT "activity_non_compliances_registradoPorId_fkey"
      FOREIGN KEY ("registradoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_non_compliances_reprogramadaPorId_fkey') THEN
    ALTER TABLE "activity_non_compliances" ADD CONSTRAINT "activity_non_compliances_reprogramadaPorId_fkey"
      FOREIGN KEY ("reprogramadaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
