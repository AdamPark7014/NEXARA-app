-- Cotización con o sin IVA.
--
-- Pedido de Adam (07-10-2026): «permite que se le pueda desactivar el IVA a una cotización,
-- porque solo se les coloca si el cliente requiere facturación». Sin factura no se suma IVA ni
-- retenciones; cada partida conserva su tasa para cuando se vuelva a encender.
--
-- Aditiva: una columna nueva con valor por omisión true (todas las cotizaciones existentes siguen
-- con IVA, como hasta hoy). Sin DROP, RENAME ni UPDATE. Idempotente.

ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "conIva" BOOLEAN NOT NULL DEFAULT true;
