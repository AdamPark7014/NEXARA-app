-- Faltas justificadas: Christian marca un día sin checada como justificado, con motivo.
-- No crea checadas ni jornada; el día se muestra como «Falta justificada · motivo».
CREATE TABLE IF NOT EXISTS "attendance_justifications" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "justifiedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_justifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_justifications_userId_date_key" ON "attendance_justifications"("userId", "date");
CREATE INDEX IF NOT EXISTS "attendance_justifications_companyId_date_idx" ON "attendance_justifications"("companyId", "date");

ALTER TABLE "attendance_justifications"
  ADD CONSTRAINT "attendance_justifications_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_justifications"
  ADD CONSTRAINT "attendance_justifications_justifiedById_fkey"
  FOREIGN KEY ("justifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attendance_justifications"
  ADD CONSTRAINT "attendance_justifications_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
