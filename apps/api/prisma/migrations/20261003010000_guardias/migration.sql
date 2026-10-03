-- Guardias de fin de semana: quién trabaja cada sábado y domingo.
--
-- Regla del dueño: el sábado y el domingo solo abre jornada quien tiene guardia ese día,
-- y su entrada se genera sola al iniciar su primer servicio o tarea del día, con la
-- ubicación y la hora de ese inicio. Lo programa dirección (a cualquiera) o el encargado
-- (a la gente de su alcance).
--
-- "fecha" es el día calendario en America/Mexico_City (columna DATE), como
-- "AttendanceDay"."date".
--
-- Aditiva: tabla nueva, ningún ALTER a tablas existentes, ningún DROP ni RENAME y
-- ningún UPDATE/INSERT/DELETE. Idempotente (IF NOT EXISTS en todo).
--
-- Los nombres de índices y llaves foráneas son los que genera Prisma.

CREATE TABLE IF NOT EXISTS "guardias" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "nota" VARCHAR(300),
    "creadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardias_pkey" PRIMARY KEY ("id")
);

-- Una guardia por persona y día en cada empresa.
CREATE UNIQUE INDEX IF NOT EXISTS "guardias_companyId_userId_fecha_key"
    ON "guardias"("companyId", "userId", "fecha");

-- «¿Quién tiene guardia este fin?» (calendario de la web).
CREATE INDEX IF NOT EXISTS "guardias_companyId_fecha_idx"
    ON "guardias"("companyId", "fecha");

DO $$ BEGIN
  ALTER TABLE "guardias"
    ADD CONSTRAINT "guardias_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Quien la programó queda en NULL si se borra su usuario: la guardia se conserva.
DO $$ BEGIN
  ALTER TABLE "guardias"
    ADD CONSTRAINT "guardias_creadoPorId_fkey"
    FOREIGN KEY ("creadoPorId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guardias"
    ADD CONSTRAINT "guardias_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
