-- Contadores de folio atómicos.
--
-- Antes cada folio salía de `count() + 1` sobre la tabla destino, y eso rompía
-- de dos maneras:
--
--   1. Concurrencia: dos altas simultáneas leían el mismo `count`, pedían el
--      mismo folio y la segunda moría contra el índice único.
--   2. Borrado suave: en `invoices` y `purchase_orders` el middleware de Prisma
--      añade `deletedAt IS NULL` a las lecturas —`count` incluido—, así que
--      borrar un registro hacía RETROCEDER el contador y el siguiente folio
--      chocaba con uno que seguía existiendo. No se recuperaba solo: cada
--      intento posterior fallaba igual.
--
-- Enteramente ADITIVA: una tabla nueva. No se toca ninguna existente.

-- CreateTable
CREATE TABLE "folio_counters" (
    "id" SERIAL NOT NULL,
    "serie" VARCHAR(20) NOT NULL,
    "valor" INTEGER NOT NULL DEFAULT 0,
    "companyId" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folio_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "folio_counters_companyId_serie_key" ON "folio_counters"("companyId", "serie");

-- AddForeignKey
ALTER TABLE "folio_counters" ADD CONSTRAINT "folio_counters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Siembra desde lo que ya existe.
--
-- El servicio sabe sembrar solo la primera vez, pero hacerlo aquí deja el
-- estado explícito y evita que la primera alta de cada serie pague la consulta.
--
-- Cuenta las filas BORRADAS a propósito: son justo las que el `count()` viejo
-- no veía, y las que hacían chocar el folio siguiente.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  s RECORD;
BEGIN
  FOR s IN
    SELECT * FROM (VALUES
      ('journal_entries',      'entryNumber',    'JE-'),
      ('invoices',             'invoiceNumber',  'INV-'),
      ('maintenance_orders',   'orderNumber',    'MO-'),
      ('maintenance_contracts','contractNumber', 'MC-'),
      ('purchase_requisitions','reqNumber',      'REQ-'),
      ('purchase_orders',      'poNumber',       'PO-'),
      ('goods_receipts',       'receiptNumber',  'GR-'),
      ('purchase_rfqs',        'rfqNumber',      'RFQ-'),
      ('stock_movements',      'movementNumber', 'SM-'),
      ('cycle_counts',         'countNumber',    'CC-'),
      ('managed_documents',    'documentNumber', 'DOC-')
    ) AS t(tabla, columna, prefijo)
  LOOP
    EXECUTE format(
      'INSERT INTO folio_counters ("companyId", serie, valor, "updatedAt")
       SELECT "companyId", %L,
              COALESCE(MAX(CAST(substring(%I FROM ''(\d+)$'') AS INTEGER)), 0),
              NOW()
         FROM %I
        WHERE %I LIKE %L AND %I ~ ''\d+$''
        GROUP BY "companyId"
       ON CONFLICT ("companyId", serie) DO NOTHING',
      s.prefijo, s.columna, s.tabla, s.columna, s.prefijo || '%%', s.columna
    );
  END LOOP;

  -- Las licitaciones numeran por año, así que su serie lleva el año dentro.
  INSERT INTO folio_counters ("companyId", serie, valor, "updatedAt")
  SELECT "companyId",
         substring("tenderNumber" FROM '^(LIC-\d{4}-)'),
         MAX(CAST(substring("tenderNumber" FROM '(\d+)$') AS INTEGER)),
         NOW()
    FROM tenders
   WHERE "tenderNumber" ~ '^LIC-\d{4}-\d+$'
   GROUP BY "companyId", substring("tenderNumber" FROM '^(LIC-\d{4}-)')
  ON CONFLICT ("companyId", serie) DO NOTHING;
END $$;
