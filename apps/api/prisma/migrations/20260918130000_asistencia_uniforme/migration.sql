-- Cumplimiento con uniforme (KPI del equipo).
--
-- El jefe revisa la foto de la entrada y marca ✓ / ✗. Todo es aditivo y
-- nullable: las checadas viejas quedan «sin revisar» (uniformeOk = NULL).

ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "uniformeOk" BOOLEAN;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "uniformeRevisadoPorId" INTEGER;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "uniformeRevisadoAt" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Attendance_uniformeRevisadoPorId_fkey'
  ) THEN
    ALTER TABLE "Attendance"
      ADD CONSTRAINT "Attendance_uniformeRevisadoPorId_fkey"
      FOREIGN KEY ("uniformeRevisadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
