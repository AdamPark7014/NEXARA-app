-- Evidencia por campos: quien asigna o despacha define QUÉ hay que documentar
-- («Cámara 1», «Rack», «Canalización») y, por cada cosa, en qué momentos se exige
-- foto: antes | en progreso | después, en cualquier combinación.
--
-- Todo es aditivo. Una actividad sin campos conserva el flujo viejo de N fotos
-- libres, así que lo que ya está abierto y la app 1.0.2 siguen funcionando igual.

CREATE TABLE IF NOT EXISTS "activity_evidence_fields" (
    "id" SERIAL NOT NULL,
    "activityId" INTEGER NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "momentos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "orden" INTEGER NOT NULL DEFAULT 0,
    "notas" VARCHAR(500),
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_evidence_fields_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "activity_evidence_field_photos" (
    "id" SERIAL NOT NULL,
    "fieldId" INTEGER NOT NULL,
    "activityId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "momento" VARCHAR(20) NOT NULL,
    "photoUrl" VARCHAR(500) NOT NULL,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "capturedAt" TIMESTAMP(3),
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_evidence_field_photos_pkey" PRIMARY KEY ("id")
);

-- Un campo se llama de una sola forma dentro de su actividad; y un campo+momento es
-- una sola foto: volver a tomarla reemplaza la anterior, no acumula.
CREATE UNIQUE INDEX IF NOT EXISTS "activity_evidence_fields_activityId_nombre_key" ON "activity_evidence_fields"("activityId", "nombre");
CREATE INDEX IF NOT EXISTS "activity_evidence_fields_activityId_idx" ON "activity_evidence_fields"("activityId");
CREATE INDEX IF NOT EXISTS "activity_evidence_fields_companyId_idx" ON "activity_evidence_fields"("companyId");

CREATE UNIQUE INDEX IF NOT EXISTS "activity_evidence_field_photos_fieldId_momento_key" ON "activity_evidence_field_photos"("fieldId", "momento");
CREATE INDEX IF NOT EXISTS "activity_evidence_field_photos_activityId_userId_idx" ON "activity_evidence_field_photos"("activityId", "userId");
CREATE INDEX IF NOT EXISTS "activity_evidence_field_photos_companyId_idx" ON "activity_evidence_field_photos"("companyId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_evidence_fields_activityId_fkey') THEN
    ALTER TABLE "activity_evidence_fields" ADD CONSTRAINT "activity_evidence_fields_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_evidence_fields_companyId_fkey') THEN
    ALTER TABLE "activity_evidence_fields" ADD CONSTRAINT "activity_evidence_fields_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_evidence_field_photos_fieldId_fkey') THEN
    ALTER TABLE "activity_evidence_field_photos" ADD CONSTRAINT "activity_evidence_field_photos_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "activity_evidence_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_evidence_field_photos_activityId_fkey') THEN
    ALTER TABLE "activity_evidence_field_photos" ADD CONSTRAINT "activity_evidence_field_photos_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_evidence_field_photos_userId_fkey') THEN
    ALTER TABLE "activity_evidence_field_photos" ADD CONSTRAINT "activity_evidence_field_photos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_evidence_field_photos_companyId_fkey') THEN
    ALTER TABLE "activity_evidence_field_photos" ADD CONSTRAINT "activity_evidence_field_photos_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
