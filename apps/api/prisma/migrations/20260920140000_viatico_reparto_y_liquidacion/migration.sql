-- Viáticos: reparto entre varias actividades + cierre del anticipo.
--
-- Aditiva y reversible. Todo lo nuevo es una tabla nueva y cuatro columnas
-- NULL: ninguna fila existente cambia de valor, ningún NOT NULL se añade sin
-- default, nada se borra ni se renombra. Un viático de siempre —una sola
-- actividad en "actividadId", sin partes— sigue leyéndose igual.
--
-- Para revertir (en este orden, sin pérdida de datos previos a esta versión):
--   DROP TABLE IF EXISTS "viatico_repartos";
--   ALTER TABLE "viaticos"
--     DROP COLUMN IF EXISTS "montoAprobado",
--     DROP COLUMN IF EXISTS "montoComprobado",
--     DROP COLUMN IF EXISTS "fechaComprobacion",
--     DROP COLUMN IF EXISTS "comprobadoPorId";

-- 1) Cierre del anticipo: se entrega un monto, se comprueba con tickets.
ALTER TABLE "viaticos"
  ADD COLUMN IF NOT EXISTS "montoAprobado" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "montoComprobado" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "fechaComprobacion" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "comprobadoPorId" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'viaticos_comprobadoPorId_fkey') THEN
    ALTER TABLE "viaticos"
      ADD CONSTRAINT "viaticos_comprobadoPorId_fkey"
      FOREIGN KEY ("comprobadoPorId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- 2) Reparto del costo entre varias actividades.
CREATE TABLE IF NOT EXISTS "viatico_repartos" (
  "id" SERIAL NOT NULL,
  "viaticoId" INTEGER NOT NULL,
  "actividadId" INTEGER NOT NULL,
  "monto" DECIMAL(10,2) NOT NULL,
  "nota" VARCHAR(255),
  "companyId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "viatico_repartos_pkey" PRIMARY KEY ("id")
);

-- Una sola parte por actividad: si no, el reparto se fragmenta y deja de poder
-- leerse "esta actividad carga X".
CREATE UNIQUE INDEX IF NOT EXISTS "viatico_repartos_viaticoId_actividadId_key"
  ON "viatico_repartos"("viaticoId", "actividadId");
CREATE INDEX IF NOT EXISTS "viatico_repartos_actividadId_idx"
  ON "viatico_repartos"("actividadId");
CREATE INDEX IF NOT EXISTS "viatico_repartos_companyId_idx"
  ON "viatico_repartos"("companyId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'viatico_repartos_viaticoId_fkey') THEN
    ALTER TABLE "viatico_repartos"
      ADD CONSTRAINT "viatico_repartos_viaticoId_fkey"
      FOREIGN KEY ("viaticoId") REFERENCES "viaticos"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'viatico_repartos_actividadId_fkey') THEN
    ALTER TABLE "viatico_repartos"
      ADD CONSTRAINT "viatico_repartos_actividadId_fkey"
      FOREIGN KEY ("actividadId") REFERENCES "Activity"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'viatico_repartos_companyId_fkey') THEN
    ALTER TABLE "viatico_repartos"
      ADD CONSTRAINT "viatico_repartos_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;
