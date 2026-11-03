-- Una sola cotización abierta a una persona mientras dure su actividad (Velocidad Core, Ola 5).
CREATE TABLE IF NOT EXISTS "cotizacion_accesos" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "cotizacionId" INTEGER NOT NULL,
    "activityId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "otorgadoPorId" INTEGER NOT NULL,
    "cambios" INTEGER NOT NULL DEFAULT 0,
    "ultimoCambioAt" TIMESTAMP(3),
    "revocadoAt" TIMESTAMP(3),
    "revocadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizacion_accesos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cotizacion_accesos_activityId_key" ON "cotizacion_accesos"("activityId");
CREATE INDEX IF NOT EXISTS "cotizacion_accesos_companyId_cotizacionId_idx" ON "cotizacion_accesos"("companyId", "cotizacionId");
CREATE INDEX IF NOT EXISTS "cotizacion_accesos_userId_idx" ON "cotizacion_accesos"("userId");
