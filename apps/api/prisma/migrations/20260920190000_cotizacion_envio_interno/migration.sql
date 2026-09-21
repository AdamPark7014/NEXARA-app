-- Envío interno de cotizaciones: pasarla a otro compañero que también cotiza.
--
-- El modelo Prisma se llama `Cotizacion`, pero la tabla es "cotizaciones" (@@map). Escribir
-- ALTER TABLE "Cotizacion" es el error que ya bloqueó once horas de migraciones.
--
-- Todo es aditivo y NULL por omisión: las cotizaciones que ya existen quedan sin asignar, que es
-- exactamente lo que son (nadie se las ha pasado a nadie).

ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "asignadoAId" INTEGER;
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "asignadoPorId" INTEGER;
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "asignadoNota" TEXT;
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "asignadoEn" TIMESTAMP(3);

-- «Mis cotizaciones pendientes» filtra por aquí.
CREATE INDEX IF NOT EXISTS "cotizaciones_asignadoAId_idx" ON "cotizaciones"("asignadoAId");

-- SET NULL: si alguien se va de la empresa, su cotización no se borra ni queda huérfana de fila;
-- se queda sin asignar y vuelve a quien la elaboró.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cotizaciones_asignadoAId_fkey'
  ) THEN
    ALTER TABLE "cotizaciones"
      ADD CONSTRAINT "cotizaciones_asignadoAId_fkey"
      FOREIGN KEY ("asignadoAId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cotizaciones_asignadoPorId_fkey'
  ) THEN
    ALTER TABLE "cotizaciones"
      ADD CONSTRAINT "cotizaciones_asignadoPorId_fkey"
      FOREIGN KEY ("asignadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- El aviso del traspaso. El enum en Postgres conserva su nombre ("NotificationType"): el modelo
-- Notification mapea a "notifications", pero el enum no lleva @@map.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'QUOTE_ASSIGNED';
