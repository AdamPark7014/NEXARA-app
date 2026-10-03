-- Almacén por código de barras: el producto guarda un código propio cuando no es
-- UPC/EAN (Code 128 del fabricante o etiqueta interna). Los UPC-A siguen en "upc" y
-- los EAN en "ean". Solo se agrega: columna nula e índices; ninguna fila cambia.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "codigoBarras" VARCHAR(64);

-- Un código no puede apuntar a dos productos de la misma empresa. Postgres deja
-- repetir NULL en un índice único, así que los productos sin código no chocan.
CREATE UNIQUE INDEX IF NOT EXISTS "Product_companyId_codigoBarras_key"
  ON "Product"("companyId", "codigoBarras");

-- El lector busca por UPC/EAN en cada disparo: sin índice recorría el catálogo entero.
CREATE INDEX IF NOT EXISTS "Product_companyId_upc_idx" ON "Product"("companyId", "upc");
CREATE INDEX IF NOT EXISTS "Product_companyId_ean_idx" ON "Product"("companyId", "ean");
