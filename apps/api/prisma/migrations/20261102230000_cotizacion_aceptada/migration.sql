-- Cómo aceptó el cliente una cotización ganada (Mapa de Core, Bloque A). Solo agrega.
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "aceptadaVia" VARCHAR(20);
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "aceptadaAt" TIMESTAMP(3);
