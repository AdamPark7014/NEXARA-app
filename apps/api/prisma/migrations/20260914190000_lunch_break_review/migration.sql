-- Comida a destiempo: justificación de salida/regreso y revisión del superior.
ALTER TABLE "lunch_breaks"
  ADD COLUMN "checkinJustificacion" TEXT,
  ADD COLUMN "checkoutJustificacion" TEXT,
  ADD COLUMN "revisionEstado" VARCHAR(20),
  ADD COLUMN "revisionNotas" TEXT,
  ADD COLUMN "revisadoPorId" INTEGER,
  ADD COLUMN "revisadoAt" TIMESTAMP(3);
