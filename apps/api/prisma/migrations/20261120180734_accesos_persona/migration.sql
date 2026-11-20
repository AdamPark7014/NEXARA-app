-- Quién ve qué (20-11-2026): accesos por persona («Ver precios», «Ver todas las cotizaciones»).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accesos" TEXT[] DEFAULT ARRAY[]::TEXT[];
