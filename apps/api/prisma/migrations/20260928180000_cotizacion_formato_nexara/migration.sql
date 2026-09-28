-- Membrete de cotización (atención y trabajo) y etiqueta de partida («1.1»).
-- Aditivo: las cotizaciones y partidas que ya existen quedan con NULL y el PDF
-- usa el cliente, «Ventas» y el orden de captura, igual que antes de esta columna.

ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "atencion" VARCHAR(180);
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "trabajo" VARCHAR(80);
ALTER TABLE "cotizacion_items" ADD COLUMN IF NOT EXISTS "partida" VARCHAR(16);
