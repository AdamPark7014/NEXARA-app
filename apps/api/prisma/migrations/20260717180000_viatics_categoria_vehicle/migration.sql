-- Viáticos: categoría tipificada + vínculo opcional a vehículo
ALTER TABLE "viaticos" ADD COLUMN IF NOT EXISTS "vehicleId" INTEGER;
ALTER TABLE "viaticos" ADD COLUMN IF NOT EXISTS "categoria" VARCHAR(40);

CREATE INDEX IF NOT EXISTS "viaticos_projectId_fechaSolicitud_idx" ON "viaticos"("projectId", "fechaSolicitud");
CREATE INDEX IF NOT EXISTS "viaticos_categoria_fechaSolicitud_idx" ON "viaticos"("categoria", "fechaSolicitud");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'viaticos_vehicleId_fkey'
  ) THEN
    ALTER TABLE "viaticos"
      ADD CONSTRAINT "viaticos_vehicleId_fkey"
      FOREIGN KEY ("vehicleId") REFERENCES "VehicleAsset"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
