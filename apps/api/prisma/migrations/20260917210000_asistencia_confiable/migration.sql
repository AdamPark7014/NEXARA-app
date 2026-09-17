-- Asistencia no manipulable (contrato del viernes 18-09, sección A).
--
-- La hora la pone el servidor, la ubicación simulada se rechaza y lo que no se
-- puede comprobar queda marcado para que una persona lo revise. Todo es
-- aditivo: las filas viejas quedan como estaban (validacion = 'OK').

ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "clientCapturedAt" TIMESTAMP(3);
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "accuracyM" DOUBLE PRECISION;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "mockDetected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "offline" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "validacion" TEXT NOT NULL DEFAULT 'OK';
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "motivoValidacion" TEXT;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "fueraDeSitio" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "distanciaSitioM" INTEGER;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "sitioNombre" TEXT;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "cierreAutomatico" BOOLEAN NOT NULL DEFAULT false;

-- Corrección de hora: sólo dirección y RH, siempre con motivo. La checada
-- original no se pisa en silencio.
CREATE TABLE IF NOT EXISTS "attendance_corrections" (
    "id" SERIAL NOT NULL,
    "attendanceId" INTEGER NOT NULL,
    "antes" TIMESTAMP(3) NOT NULL,
    "despues" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "porId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "attendance_corrections_attendanceId_idx" ON "attendance_corrections"("attendanceId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_corrections_attendanceId_fkey'
  ) THEN
    ALTER TABLE "attendance_corrections"
      ADD CONSTRAINT "attendance_corrections_attendanceId_fkey"
      FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_corrections_porId_fkey'
  ) THEN
    ALTER TABLE "attendance_corrections"
      ADD CONSTRAINT "attendance_corrections_porId_fkey"
      FOREIGN KEY ("porId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Aviso nuevo: checada que alguien debe mirar (ícono push `asistencia_alerta`).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_FLAGGED';
