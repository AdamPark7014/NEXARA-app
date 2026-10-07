-- Archivos adjuntos a una actividad.
--
-- Pedido de Adam (07-10-2026): las actividades comerciales llevan evidencia en Excel, Word o
-- PDF, y quiere adjuntarla y verla embebida en la web y en las apps. Hasta hoy la evidencia
-- solo aceptaba fotos y, en comerciales, los anexos de la cotización (imágenes y PDF).
--
-- Aditiva: una tabla nueva, ningún ALTER a tablas existentes, ningún DROP ni RENAME y ningún
-- UPDATE/INSERT/DELETE. Idempotente (IF NOT EXISTS en todo).
--
-- Los nombres de índices y llaves foráneas son los que genera Prisma.

CREATE TABLE IF NOT EXISTS "activity_attachments" (
    "id" SERIAL NOT NULL,
    "activityId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER,
    "nombre" VARCHAR(255) NOT NULL,
    "fileUrl" VARCHAR(500) NOT NULL,
    "mimeType" VARCHAR(150),
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "activity_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "activity_attachments_activityId_idx" ON "activity_attachments"("activityId");
CREATE INDEX IF NOT EXISTS "activity_attachments_companyId_idx" ON "activity_attachments"("companyId");

DO $$ BEGIN
  ALTER TABLE "activity_attachments" ADD CONSTRAINT "activity_attachments_activityId_fkey"
    FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "activity_attachments" ADD CONSTRAINT "activity_attachments_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "activity_attachments" ADD CONSTRAINT "activity_attachments_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
