-- Asistencia confiable → nómina: lo que faltaba después de WS0 (20260918150000).
--
--   1. Antigüedad del punto de GPS que reportó el teléfono (`Attendance.fixAgeMs`): sirve
--      para distinguir una medición del momento de una posición guardada hace media hora.
--   2. Salida de emergencia auditada: un jefe puede registrar la checada de alguien
--      (teléfono roto, sin batería, se le olvidó) y queda quién la puso y por qué.
--   3. Horario propio por persona (`work_schedules`): hora de entrada, de salida, días,
--      gracia y jornada ordinaria. Tabla vacía = nada cambia; manda la plantilla de acceso.
--   4. Ubicación simulada en las fotos de entrada y salida de actividad, que es de donde
--      salen las horas productivas.
--
-- Todo aditivo: columnas nullable o con default, una tabla nueva, ningún DROP ni RENAME y
-- ningún UPDATE/INSERT/DELETE. Idempotente (IF NOT EXISTS) para poder correrla dos veces.
-- Los nombres de índices y llaves foráneas son los que genera Prisma.

-- ---------------------------------------------------------------------------
-- 1. Antigüedad de la medición de GPS de la checada.
-- ---------------------------------------------------------------------------
-- La mide el teléfono con su reloj monótono (Android `elapsedRealtimeNanos`, iOS la
-- diferencia contra `CLLocation.timestamp`): mover la hora del sistema no la altera.
-- NULL = app vieja que todavía no la manda.
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "fixAgeMs" INTEGER;

-- ---------------------------------------------------------------------------
-- 2. Checada registrada por un jefe (salida de emergencia auditada).
-- ---------------------------------------------------------------------------
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "registradaPorId" INTEGER;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "motivoRegistro" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Attendance_registradaPorId_fkey') THEN
    ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_registradaPorId_fkey"
      FOREIGN KEY ("registradaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Horario propio por persona.
-- ---------------------------------------------------------------------------
-- Cada columna en NULL hereda el valor de su plantilla de acceso, así que se puede cambiar
-- solo la hora de entrada de alguien sin decidir de paso su jornada ni sus días. `dias`
-- vacío = los de la plantilla (lunes a viernes).
CREATE TABLE IF NOT EXISTS "work_schedules" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "horaEntrada" VARCHAR(5),
  "horaSalida" VARCHAR(5),
  "dias" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "graciaMin" INTEGER,
  "jornadaOrdinariaMin" INTEGER,
  "actualizadoPorId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "companyId" INTEGER NOT NULL,

  CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "work_schedules_userId_key" ON "work_schedules"("userId");
CREATE INDEX IF NOT EXISTS "work_schedules_companyId_idx" ON "work_schedules"("companyId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_schedules_userId_fkey') THEN
    ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_schedules_actualizadoPorId_fkey') THEN
    ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_actualizadoPorId_fkey"
      FOREIGN KEY ("actualizadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_schedules_companyId_fkey') THEN
    ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. Ubicación simulada en las fotos de entrada y salida de actividad.
-- ---------------------------------------------------------------------------
-- De estas dos fotos salen las horas productivas; si la ubicación era falsa hay que poder
-- saberlo. NULL = foto vieja o cliente que todavía no lo informa (no es lo mismo que FALSE).
ALTER TABLE "activity_evidences" ADD COLUMN IF NOT EXISTS "entryMockLocation" BOOLEAN;
ALTER TABLE "activity_evidences" ADD COLUMN IF NOT EXISTS "exitMockLocation" BOOLEAN;
