-- Herramientas: flag de kit personal y fuente de herramienta por renglón
-- Idempotente para ambientes ya aplicados parcialmente.

-- 1) Enum ToolSource (KIT | INVENTORY)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ToolSource') THEN
    CREATE TYPE "ToolSource" AS ENUM ('KIT','INVENTORY');
  END IF;
END
$$;

-- 2) Activity.usesPersonalKit (boolean, default false)
ALTER TABLE "Activity"
  ADD COLUMN IF NOT EXISTS "usesPersonalKit" BOOLEAN NOT NULL DEFAULT false;

-- 3) ActivityToolRequirement.toolSource ("ToolSource", nullable)
ALTER TABLE "activity_tool_requirements"
  ADD COLUMN IF NOT EXISTS "toolSource" "ToolSource";

