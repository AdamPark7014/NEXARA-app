-- AlterTable: add checkout/return tracking columns to VehicleAsset
ALTER TABLE "VehicleAsset"
  ADD COLUMN IF NOT EXISTS "assignedToId"     INTEGER,
  ADD COLUMN IF NOT EXISTS "assignedAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "salidaFotos"      JSONB,
  ADD COLUMN IF NOT EXISTS "devolucionFotos"  JSONB,
  ADD COLUMN IF NOT EXISTS "tiempoUsoMinutos" INTEGER;

-- AddForeignKey
ALTER TABLE "VehicleAsset"
  ADD CONSTRAINT "VehicleAsset_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
