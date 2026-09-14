-- Registro de reprogramaciones (día/hora) de una actividad: quién, de qué fecha a cuál y por qué.
CREATE TABLE "activity_schedule_changes" (
    "id" SERIAL NOT NULL,
    "activityId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "cambiadoPorId" INTEGER,
    "fechaAnterior" TIMESTAMP(3),
    "fechaNueva" TIMESTAMP(3) NOT NULL,
    "motivo" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_schedule_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "activity_schedule_changes_activityId_idx" ON "activity_schedule_changes"("activityId");
CREATE INDEX "activity_schedule_changes_companyId_idx" ON "activity_schedule_changes"("companyId");

ALTER TABLE "activity_schedule_changes"
  ADD CONSTRAINT "activity_schedule_changes_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "activity_schedule_changes"
  ADD CONSTRAINT "activity_schedule_changes_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activity_schedule_changes"
  ADD CONSTRAINT "activity_schedule_changes_cambiadoPorId_fkey"
  FOREIGN KEY ("cambiadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Aviso «Actividad reprogramada».
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACTIVITY_RESCHEDULED';
