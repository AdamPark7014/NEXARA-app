-- Horario por persona/día, plantillas de turno y parámetros de productividad con vigencia.
-- Aditiva. No toca WorkSchedule ni AttendanceDay existentes.

CREATE TABLE IF NOT EXISTS "plantillas_turno" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "clave" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "horaEntrada" VARCHAR(5) NOT NULL,
    "horaSalida" VARCHAR(5) NOT NULL,
    "tipo" VARCHAR(12) NOT NULL DEFAULT 'diurno',
    "color" VARCHAR(16),
    "graciaMin" INTEGER,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plantillas_turno_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "plantillas_turno_companyId_clave_key" ON "plantillas_turno"("companyId", "clave");
CREATE INDEX IF NOT EXISTS "plantillas_turno_companyId_idx" ON "plantillas_turno"("companyId");

CREATE TABLE IF NOT EXISTS "horarios_dia" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "horaEntrada" VARCHAR(5) NOT NULL,
    "horaSalida" VARCHAR(5) NOT NULL,
    "graciaMin" INTEGER,
    "motivo" TEXT,
    "plantillaTurnoId" INTEGER,
    "creadoPorId" INTEGER,
    "ajustes" JSONB NOT NULL DEFAULT '[]',
    "avisos" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "horarios_dia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "horarios_dia_userId_fecha_key" ON "horarios_dia"("userId", "fecha");
CREATE INDEX IF NOT EXISTS "horarios_dia_companyId_fecha_idx" ON "horarios_dia"("companyId", "fecha");
CREATE INDEX IF NOT EXISTS "horarios_dia_companyId_userId_idx" ON "horarios_dia"("companyId", "userId");

CREATE TABLE IF NOT EXISTS "productividad_parametros" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "vigenteDesde" DATE NOT NULL,
    "rangoNormalInicio" VARCHAR(5) NOT NULL DEFAULT '10:00',
    "rangoNormalFin" VARCHAR(5) NOT NULL DEFAULT '18:00',
    "graciaMin" INTEGER NOT NULL DEFAULT 15,
    "pesoPuntualidad" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "pesoAprovechamiento" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "pesoEficiencia" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "topeBonoPct" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "factorExtra" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "topeExtraSemanaMin" INTEGER NOT NULL DEFAULT 540,
    "franjaNocturnaInicio" VARCHAR(5) NOT NULL DEFAULT '20:00',
    "franjaNocturnaFin" VARCHAR(5) NOT NULL DEFAULT '06:00',
    "creadoPorId" INTEGER,
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "productividad_parametros_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "productividad_parametros_companyId_vigenteDesde_key" ON "productividad_parametros"("companyId", "vigenteDesde");
CREATE INDEX IF NOT EXISTS "productividad_parametros_companyId_idx" ON "productividad_parametros"("companyId");

DO $$ BEGIN
  ALTER TABLE "plantillas_turno" ADD CONSTRAINT "plantillas_turno_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "horarios_dia" ADD CONSTRAINT "horarios_dia_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "horarios_dia" ADD CONSTRAINT "horarios_dia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "horarios_dia" ADD CONSTRAINT "horarios_dia_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "horarios_dia" ADD CONSTRAINT "horarios_dia_plantillaTurnoId_fkey" FOREIGN KEY ("plantillaTurnoId") REFERENCES "plantillas_turno"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "productividad_parametros" ADD CONSTRAINT "productividad_parametros_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "productividad_parametros" ADD CONSTRAINT "productividad_parametros_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
