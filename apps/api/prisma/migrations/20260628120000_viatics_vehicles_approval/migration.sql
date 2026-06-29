-- Viáticos: trazabilidad de aprobación + referencia contabilidad
ALTER TABLE "viaticos" ADD COLUMN IF NOT EXISTS "approvalStep" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "viaticos" ADD COLUMN IF NOT EXISTS "approvalTrail" JSONB;
ALTER TABLE "viaticos" ADD COLUMN IF NOT EXISTS "contabilidadRef" VARCHAR(120);

-- Vehículos: aprobación, odómetro, combustible, fotos estructuradas
ALTER TABLE "VehicleControl" ADD COLUMN IF NOT EXISTS "approvalStep" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "VehicleControl" ADD COLUMN IF NOT EXISTS "approvalTrail" JSONB;
ALTER TABLE "VehicleControl" ADD COLUMN IF NOT EXISTS "odometroInicio" INTEGER;
ALTER TABLE "VehicleControl" ADD COLUMN IF NOT EXISTS "odometroFin" INTEGER;
ALTER TABLE "VehicleControl" ADD COLUMN IF NOT EXISTS "combustibleInicioPct" INTEGER;
ALTER TABLE "VehicleControl" ADD COLUMN IF NOT EXISTS "combustibleFinPct" INTEGER;
ALTER TABLE "VehicleControl" ADD COLUMN IF NOT EXISTS "fotosSalida" JSONB;
ALTER TABLE "VehicleControl" ADD COLUMN IF NOT EXISTS "fotosDevolucion" JSONB;
