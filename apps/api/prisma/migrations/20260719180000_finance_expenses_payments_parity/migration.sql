-- Homologación finanzas: Expense admin tipado + EmployeePayment status

ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "isAdministrative" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "concepto" VARCHAR(255);
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "categoria" VARCHAR(40);
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "esRecurrente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "fechaGasto" TIMESTAMP(3);
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "contabilidadRef" VARCHAR(120);
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "createdById" INTEGER;

CREATE INDEX IF NOT EXISTS "Expense_isAdministrative_estatusPago_fechaSolicitud_idx"
  ON "Expense"("isAdministrative", "estatusPago", "fechaSolicitud");
CREATE INDEX IF NOT EXISTS "Expense_categoria_fechaSolicitud_idx"
  ON "Expense"("categoria", "fechaSolicitud");

DO $$ BEGIN
  ALTER TABLE "Expense"
    ADD CONSTRAINT "Expense_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill admin rows from razonGasto JSON
DO $$
DECLARE
  r RECORD;
  meta JSONB;
  estado_raw TEXT;
  estatus_norm TEXT;
BEGIN
  FOR r IN
    SELECT id, "razonGasto", "estatusPago", "fechaSolicitud"
    FROM "Expense"
    WHERE "razonGasto" IS NOT NULL
      AND ("razonGasto" ILIKE '%"tipo":"ADMIN"%' OR "razonGasto" ILIKE '%"tipo": "ADMIN"%')
  LOOP
    BEGIN
      meta := r."razonGasto"::JSONB;
    EXCEPTION WHEN OTHERS THEN
      meta := jsonb_build_object('concepto', LEFT(COALESCE(r."razonGasto", 'Gasto administrativo'), 255));
    END;

    estado_raw := UPPER(COALESCE(meta->>'estado', r."estatusPago", 'PENDIENTE'));
    IF estado_raw IN ('PAGADO', 'APROBADO') AND (meta->>'estado' ILIKE 'PAGADO' OR LOWER(r."estatusPago") = 'pagado') THEN
      estatus_norm := 'Pagado';
    ELSIF estado_raw IN ('APROBADO', 'APPROVED') THEN
      estatus_norm := 'Aprobado';
    ELSIF estado_raw IN ('RECHAZADO', 'REJECTED') THEN
      estatus_norm := 'Rechazado';
    ELSIF LOWER(r."estatusPago") = 'pagado' THEN
      estatus_norm := 'Pagado';
    ELSIF LOWER(r."estatusPago") IN ('aprobado', 'approved') THEN
      estatus_norm := 'Aprobado';
    ELSIF LOWER(r."estatusPago") IN ('rechazado', 'rejected') THEN
      estatus_norm := 'Rechazado';
    ELSE
      estatus_norm := 'Pendiente';
    END IF;

    UPDATE "Expense"
    SET
      "isAdministrative" = true,
      "concepto" = LEFT(COALESCE(NULLIF(meta->>'concepto', ''), 'Gasto administrativo'), 255),
      "categoria" = LEFT(COALESCE(NULLIF(meta->>'categoria', ''), 'Servicios'), 40),
      "esRecurrente" = COALESCE((meta->>'esRecurrente')::BOOLEAN, false),
      "fechaGasto" = COALESCE(
        CASE
          WHEN meta->>'fecha' ~ '^\d{4}-\d{2}-\d{2}' THEN (meta->>'fecha')::TIMESTAMP
          ELSE NULL
        END,
        r."fechaSolicitud",
        NOW()
      ),
      "estatusPago" = estatus_norm
    WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE "employee_payments" ADD COLUMN IF NOT EXISTS "concepto" VARCHAR(255);
ALTER TABLE "employee_payments" ADD COLUMN IF NOT EXISTS "status" VARCHAR(30) NOT NULL DEFAULT 'Pagado';
ALTER TABLE "employee_payments" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "employee_payments" ADD COLUMN IF NOT EXISTS "contabilidadRef" VARCHAR(120);
ALTER TABLE "employee_payments" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "employee_payments_status_periodFrom_idx"
  ON "employee_payments"("status", "periodFrom");

UPDATE "employee_payments"
SET
  "paidAt" = COALESCE("paidAt", "createdAt"),
  "status" = COALESCE(NULLIF(TRIM("status"), ''), 'Pagado'),
  "concepto" = COALESCE("concepto", LEFT(COALESCE("note", 'Pago a empleado'), 255))
WHERE "deletedAt" IS NULL;
