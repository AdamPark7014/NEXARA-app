-- Almacén CT de surtido por partida (código API: 14A, 35A, …)
ALTER TABLE "cotizacion_items" ADD COLUMN IF NOT EXISTS "supplierWarehouseCode" VARCHAR(10);
