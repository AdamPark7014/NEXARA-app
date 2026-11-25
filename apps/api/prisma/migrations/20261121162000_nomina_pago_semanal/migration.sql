-- Pago semanal editable: sugerido, ajustes (movimientos) y registros CEO (parcialidades).
-- Aditiva.

ALTER TABLE "nomina_semanas" ADD COLUMN IF NOT EXISTS "parametrosSnapshot" JSONB;
ALTER TABLE "nomina_semana_filas" ADD COLUMN IF NOT EXISTS "pagoSugerido" DECIMAL(12,2);

CREATE TABLE IF NOT EXISTS "nomina_pago_ajustes" (
    "id" SERIAL NOT NULL,
    "semanaId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "motivo" VARCHAR(500) NOT NULL,
    "autorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "nomina_pago_ajustes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "nomina_pago_ajustes_semanaId_userId_idx" ON "nomina_pago_ajustes"("semanaId", "userId");
CREATE INDEX IF NOT EXISTS "nomina_pago_ajustes_companyId_idx" ON "nomina_pago_ajustes"("companyId");

CREATE TABLE IF NOT EXISTS "nomina_pago_registros" (
    "id" SERIAL NOT NULL,
    "semanaId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha" DATE NOT NULL,
    "forma" VARCHAR(20) NOT NULL,
    "comprobanteUrl" VARCHAR(500),
    "employeePaymentId" INTEGER,
    "creadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "nomina_pago_registros_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "nomina_pago_registros_semanaId_userId_idx" ON "nomina_pago_registros"("semanaId", "userId");
CREATE INDEX IF NOT EXISTS "nomina_pago_registros_companyId_idx" ON "nomina_pago_registros"("companyId");

DO $$ BEGIN
  ALTER TABLE "nomina_pago_ajustes" ADD CONSTRAINT "nomina_pago_ajustes_semanaId_fkey" FOREIGN KEY ("semanaId") REFERENCES "nomina_semanas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "nomina_pago_ajustes" ADD CONSTRAINT "nomina_pago_ajustes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "nomina_pago_ajustes" ADD CONSTRAINT "nomina_pago_ajustes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "nomina_pago_ajustes" ADD CONSTRAINT "nomina_pago_ajustes_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "nomina_pago_registros" ADD CONSTRAINT "nomina_pago_registros_semanaId_fkey" FOREIGN KEY ("semanaId") REFERENCES "nomina_semanas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "nomina_pago_registros" ADD CONSTRAINT "nomina_pago_registros_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "nomina_pago_registros" ADD CONSTRAINT "nomina_pago_registros_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "nomina_pago_registros" ADD CONSTRAINT "nomina_pago_registros_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "nomina_pago_registros" ADD CONSTRAINT "nomina_pago_registros_employeePaymentId_fkey" FOREIGN KEY ("employeePaymentId") REFERENCES "employee_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
