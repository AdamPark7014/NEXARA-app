-- Evidencia en cada entrega (Adam, 21-11-2026). Aditiva: columnas nuevas y anulables, no toca datos.

-- Préstamo de herramienta: fotos de cómo sale («antes») y quién la entregó;
-- al volver, en qué estado llegó, sus fotos («después») y quién la recibió.
ALTER TABLE "tool_requests" ADD COLUMN IF NOT EXISTS "deliveryPhotos" JSONB;
ALTER TABLE "tool_requests" ADD COLUMN IF NOT EXISTS "deliveredById" INTEGER;
ALTER TABLE "tool_requests" ADD COLUMN IF NOT EXISTS "returnCondition" VARCHAR(20);
ALTER TABLE "tool_requests" ADD COLUMN IF NOT EXISTS "returnPhotos" JSONB;
ALTER TABLE "tool_requests" ADD COLUMN IF NOT EXISTS "returnNotes" TEXT;
ALTER TABLE "tool_requests" ADD COLUMN IF NOT EXISTS "receivedById" INTEGER;

-- Movimiento de almacén: fotos de lo que sale, número de serie de cada pieza y quién se lo lleva.
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "fotos" JSONB;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "series" JSONB;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "recibidoPorId" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tool_requests_deliveredById_fkey') THEN
    ALTER TABLE "tool_requests" ADD CONSTRAINT "tool_requests_deliveredById_fkey"
      FOREIGN KEY ("deliveredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tool_requests_receivedById_fkey') THEN
    ALTER TABLE "tool_requests" ADD CONSTRAINT "tool_requests_receivedById_fkey"
      FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_recibidoPorId_fkey') THEN
    ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_recibidoPorId_fkey"
      FOREIGN KEY ("recibidoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "stock_movements_recibidoPorId_idx" ON "stock_movements"("recibidoPorId");
