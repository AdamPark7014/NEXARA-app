-- Sesiones de trabajo de una actividad: cada tramo en que corrió el reloj de una persona.
--
-- Hasta hoy el tiempo real era un solo intervalo ("activity_assignees"."inicioRealAt" →
-- "finRealAt"), así que una actividad de varios días contaba noches y fines de semana
-- como trabajo y los KPI salían con productividad irreal. Con esta tabla el tiempo es
-- la suma de sus sesiones: se abren al iniciar o reanudar y se cierran con la foto de
-- salida (FIN), una pausa (PAUSA), la checada de salida (SALIDA), a las 12 horas
-- (TOPE_12H) o al terminar el día (CORTE_DIA).
--
-- Aditiva: tabla nueva, ningún ALTER a tablas existentes, ningún DROP ni RENAME y
-- ningún UPDATE/INSERT/DELETE. Las actividades que ya existen quedan sin filas y siguen
-- midiéndose con su intervalo de siempre (con tope de 12 h) hasta que alguien las
-- reanude. Idempotente (IF NOT EXISTS en todo).
--
-- Los nombres de índices y llaves foráneas son los que genera Prisma.

CREATE TABLE IF NOT EXISTS "activity_work_sessions" (
    "id" SERIAL NOT NULL,
    "activityId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endReason" VARCHAR(20),
    "endedById" INTEGER,
    "nota" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_work_sessions_pkey" PRIMARY KEY ("id")
);

-- «¿Qué tiene corriendo esta persona?» (endedAt IS NULL) al checar salida y al leer su cola.
CREATE INDEX IF NOT EXISTS "activity_work_sessions_userId_endedAt_idx"
    ON "activity_work_sessions"("userId", "endedAt");

CREATE INDEX IF NOT EXISTS "activity_work_sessions_activityId_userId_idx"
    ON "activity_work_sessions"("activityId", "userId");

CREATE INDEX IF NOT EXISTS "activity_work_sessions_companyId_idx"
    ON "activity_work_sessions"("companyId");

DO $$ BEGIN
  ALTER TABLE "activity_work_sessions"
    ADD CONSTRAINT "activity_work_sessions_activityId_fkey"
    FOREIGN KEY ("activityId") REFERENCES "Activity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "activity_work_sessions"
    ADD CONSTRAINT "activity_work_sessions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Quien pausó queda en NULL si se borra su usuario: la sesión y su tiempo se conservan.
DO $$ BEGIN
  ALTER TABLE "activity_work_sessions"
    ADD CONSTRAINT "activity_work_sessions_endedById_fkey"
    FOREIGN KEY ("endedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "activity_work_sessions"
    ADD CONSTRAINT "activity_work_sessions_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
