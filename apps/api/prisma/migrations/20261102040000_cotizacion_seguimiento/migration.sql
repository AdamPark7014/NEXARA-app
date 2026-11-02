-- Programa Velocidad Core (01-11-2026): «Ya la envié» y seguimiento de cotizaciones.
-- Idempotente: se aplica antes de subir el código, para que un despliegue ajeno sin migrar no encuentre
-- la API nueva sin sus columnas. El código viejo las ignora.

-- AlterTable
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "enviadaPor" VARCHAR(20);
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "borradorAvisadoAt" TIMESTAMP(3);
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "seguimientoEtapa" INTEGER NOT NULL DEFAULT 0;
