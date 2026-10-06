-- Control de nómina semanal (lunes → domingo).
--
-- Pedido de Adam (05-10-2026): el «control de pagos» que hoy se llena a mano en dos Excel
-- («Control de entradas y salidas» y «Control de nómina NEXARA»). Las horas, el lugar de cada
-- día, los viáticos y las horas extra salen solos de lo que ya existe (checadas, horario,
-- viáticos, OvertimeApproval, guardias, faltas). En estas tablas solo se guarda lo que una
-- persona decide encima:
--
--   * "nomina_semanas":      la semana de una empresa y su estado (BORRADOR → CERRADA), con
--                            quién la cerró o la reabrió, cuándo y por qué.
--   * "nomina_semana_dias":  el lugar de un día corregido a mano (sin fila = automático).
--   * "nomina_semana_filas": la nota de la fila, la foto de lo que se pagó al cerrar
--                            ("snapshot") y el pago en Borrador que generó el cierre.
--   * "nomina_descuentos":   descuentos manuales y los sugeridos (faltas) que alguien aceptó.
--
-- "inicio", "fin" y "fecha" son días calendario en America/Mexico_City (columna DATE), como
-- "AttendanceDay"."date" y "guardias"."fecha".
--
-- Aditiva: tablas nuevas, ningún ALTER a tablas existentes, ningún DROP ni RENAME y ningún
-- UPDATE/INSERT/DELETE. Idempotente (IF NOT EXISTS en todo).
--
-- Los nombres de índices y llaves foráneas son los que genera Prisma.

CREATE TABLE IF NOT EXISTS "nomina_semanas" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "inicio" DATE NOT NULL,
    "fin" DATE NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'BORRADOR',
    "cerradaPorId" INTEGER,
    "cerradaAt" TIMESTAMP(3),
    "reabiertaPorId" INTEGER,
    "reabiertaAt" TIMESTAMP(3),
    "reabiertaMotivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nomina_semanas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "nomina_semana_dias" (
    "id" SERIAL NOT NULL,
    "semanaId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "lugar" VARCHAR(40) NOT NULL,
    "nota" VARCHAR(300),
    "ajustadoPorId" INTEGER,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nomina_semana_dias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "nomina_semana_filas" (
    "id" SERIAL NOT NULL,
    "semanaId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "notaFila" VARCHAR(500),
    "snapshot" JSONB,
    "pagoId" INTEGER,
    "actualizadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nomina_semana_filas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "nomina_descuentos" (
    "id" SERIAL NOT NULL,
    "semanaId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "concepto" VARCHAR(200) NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "sugerido" BOOLEAN NOT NULL DEFAULT false,
    "fecha" DATE,
    "creadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nomina_descuentos_pkey" PRIMARY KEY ("id")
);

-- Una semana por empresa y lunes: dos pestañas abiertas no pueden crear dos controles.
CREATE UNIQUE INDEX IF NOT EXISTS "nomina_semanas_companyId_inicio_key"
    ON "nomina_semanas"("companyId", "inicio");
CREATE INDEX IF NOT EXISTS "nomina_semanas_companyId_idx"
    ON "nomina_semanas"("companyId");

-- Un ajuste de lugar por persona y día dentro de la semana.
CREATE UNIQUE INDEX IF NOT EXISTS "nomina_semana_dias_semanaId_userId_fecha_key"
    ON "nomina_semana_dias"("semanaId", "userId", "fecha");
CREATE INDEX IF NOT EXISTS "nomina_semana_dias_companyId_idx"
    ON "nomina_semana_dias"("companyId");

-- Una fila (nota / foto del cierre) por persona y semana.
CREATE UNIQUE INDEX IF NOT EXISTS "nomina_semana_filas_semanaId_userId_key"
    ON "nomina_semana_filas"("semanaId", "userId");
CREATE INDEX IF NOT EXISTS "nomina_semana_filas_companyId_idx"
    ON "nomina_semana_filas"("companyId");

CREATE INDEX IF NOT EXISTS "nomina_descuentos_semanaId_userId_idx"
    ON "nomina_descuentos"("semanaId", "userId");
CREATE INDEX IF NOT EXISTS "nomina_descuentos_companyId_idx"
    ON "nomina_descuentos"("companyId");

-- ── Llaves foráneas ─────────────────────────────────────────────────────────────
-- Empresa: RESTRICT, como el resto de tablas aisladas por empresa.
-- Semana: CASCADE (los ajustes, filas y descuentos no existen sin su semana).
-- Persona: RESTRICT (la historia de nómina no se borra con el usuario; se desactiva).
-- Autores (quién cerró, reabrió, ajustó o creó): SET NULL, el registro se conserva.

DO $$ BEGIN
  ALTER TABLE "nomina_semanas"
    ADD CONSTRAINT "nomina_semanas_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "nomina_semanas"
    ADD CONSTRAINT "nomina_semanas_cerradaPorId_fkey"
    FOREIGN KEY ("cerradaPorId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "nomina_semanas"
    ADD CONSTRAINT "nomina_semanas_reabiertaPorId_fkey"
    FOREIGN KEY ("reabiertaPorId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "nomina_semana_dias"
    ADD CONSTRAINT "nomina_semana_dias_semanaId_fkey"
    FOREIGN KEY ("semanaId") REFERENCES "nomina_semanas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "nomina_semana_dias"
    ADD CONSTRAINT "nomina_semana_dias_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "nomina_semana_dias"
    ADD CONSTRAINT "nomina_semana_dias_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "nomina_semana_dias"
    ADD CONSTRAINT "nomina_semana_dias_ajustadoPorId_fkey"
    FOREIGN KEY ("ajustadoPorId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "nomina_semana_filas"
    ADD CONSTRAINT "nomina_semana_filas_semanaId_fkey"
    FOREIGN KEY ("semanaId") REFERENCES "nomina_semanas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "nomina_semana_filas"
    ADD CONSTRAINT "nomina_semana_filas_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "nomina_semana_filas"
    ADD CONSTRAINT "nomina_semana_filas_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "nomina_semana_filas"
    ADD CONSTRAINT "nomina_semana_filas_actualizadoPorId_fkey"
    FOREIGN KEY ("actualizadoPorId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "nomina_descuentos"
    ADD CONSTRAINT "nomina_descuentos_semanaId_fkey"
    FOREIGN KEY ("semanaId") REFERENCES "nomina_semanas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "nomina_descuentos"
    ADD CONSTRAINT "nomina_descuentos_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "nomina_descuentos"
    ADD CONSTRAINT "nomina_descuentos_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "nomina_descuentos"
    ADD CONSTRAINT "nomina_descuentos_creadoPorId_fkey"
    FOREIGN KEY ("creadoPorId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
