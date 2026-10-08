-- Tipo de artículo de almacén.
--
-- Pedido de Adam (07-10-2026): «haz un tipado más fuerte … una cosa es un taladro que es uno y
-- uno, y otra un bote de cinchos o clavos o una bolsa de taquetes». Cuatro tipos: HERRAMIENTA
-- (vive en tool_inventory_items, no aquí), EQUIPO, CONSUMIBLE y MEDIDA. La capacidad del empaque
-- («bote de 100 piezas», «bobina de 305 m») ya vive en product_packagings.
--
-- Aditiva: una columna nueva que admite null (los productos existentes quedan «Sin tipo») y su
-- índice por empresa para los chips de la búsqueda rápida. Sin DROP, RENAME ni UPDATE.
-- Idempotente.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "tipoArticulo" VARCHAR(20);

CREATE INDEX IF NOT EXISTS "Product_companyId_tipoArticulo_idx" ON "Product"("companyId", "tipoArticulo");
