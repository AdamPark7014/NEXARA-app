-- Teléfonos con la ubicación apagada o sin permiso durante la jornada.
--
-- Pedido de Adam (08-10-2026): «que nos registre si hay algún dispositivo con la ubicación apagada».
-- Solo cambios de estado (APAGADA / SIN_PERMISO abren un tramo, ENCENDIDA lo cierra).
--
-- Aditiva: una tabla nueva con sus índices y llaves. Sin DROP, RENAME ni UPDATE. Idempotente.

CREATE TABLE IF NOT EXISTS "location_status_events" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "estado" VARCHAR(20) NOT NULL,
    "fuente" VARCHAR(10) NOT NULL,
    "origen" VARCHAR(10),
    "deviceInfo" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_status_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "location_status_events_companyId_at_idx" ON "location_status_events"("companyId", "at");
CREATE INDEX IF NOT EXISTS "location_status_events_userId_at_idx" ON "location_status_events"("userId", "at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'location_status_events_userId_fkey') THEN
    ALTER TABLE "location_status_events" ADD CONSTRAINT "location_status_events_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'location_status_events_companyId_fkey') THEN
    ALTER TABLE "location_status_events" ADD CONSTRAINT "location_status_events_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
