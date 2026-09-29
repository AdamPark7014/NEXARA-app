-- Margen general de la cotización: markup sobre el costo
-- (precio = costo × (1 + margen/100)). Null = cada partida usa el suyo.
ALTER TABLE "cotizaciones" ADD COLUMN "marginPercent" DECIMAL(7,2);
