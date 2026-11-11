-- Reuniones: las que ya existían solo las ve dirección (Adam, 11-11-2026).
ALTER TABLE "operational_meetings" ADD COLUMN IF NOT EXISTS "soloDireccion" BOOLEAN NOT NULL DEFAULT false;
UPDATE "operational_meetings" SET "soloDireccion" = true;
