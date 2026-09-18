-- Periodo de las actividades (regla del dueño, 18-09): una actividad de varios días
-- lleva su día de inicio y su día de fin, y así no hay que volver a cargarla cada día.
-- También se guarda la etapa del proyecto que ejecuta, para «Programar actividades del
-- proyecto» sin duplicar.
--
-- Todo es aditivo y nulo: las actividades que ya existen no tienen periodo y se
-- comportan exactamente igual que antes; las apps viejas ignoran las columnas.

ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "periodoInicio" DATE;
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "periodoFin" DATE;
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "projectMilestoneId" INTEGER;

CREATE INDEX IF NOT EXISTS "Activity_projectMilestoneId_idx" ON "Activity"("projectMilestoneId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Activity_projectMilestoneId_fkey') THEN
    ALTER TABLE "Activity"
      ADD CONSTRAINT "Activity_projectMilestoneId_fkey"
      FOREIGN KEY ("projectMilestoneId") REFERENCES "project_milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
