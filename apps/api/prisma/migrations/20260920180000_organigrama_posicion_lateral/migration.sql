-- Colocación lateral en el organigrama (Adam, 20-09-2026).
--
-- `managerId` solo sabe decir «cuelga de». Adam necesita colocar gente AL LADO de
-- un nivel sin que parezca su jefe ni su subordinado: Luis junto a José Antonio,
-- el arquitecto y la contadora al costado del segundo nivel, Mónica a la par de
-- Daniela Hernández.
--
-- `lateralDeId` es SOLO dibujo. Ningún cálculo de alcance, permisos, avisos ni KPI
-- lo lee: todos siguen con `managerId`, que esta migración no toca. Aditiva: la
-- columna nace en NULL para todos y el organigrama se ve exactamente igual hasta
-- que alguien la acomode desde la pantalla.
--
-- La tabla real del modelo Prisma `User` es "User" (no tiene @@map).

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lateralDeId" INTEGER;

CREATE INDEX IF NOT EXISTS "User_lateralDeId_idx" ON "User"("lateralDeId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_lateralDeId_fkey') THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_lateralDeId_fkey"
      FOREIGN KEY ("lateralDeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
