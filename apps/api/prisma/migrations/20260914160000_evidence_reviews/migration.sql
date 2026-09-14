-- Calificación de eficiencia (1–5) de la última revisión de cada evidencia.
ALTER TABLE "activity_evidences" ADD COLUMN "eficienciaScore" INTEGER;

-- Registro de revisiones: aprobada / devuelta por pasos / devuelta completa, con observaciones y calificación.
CREATE TABLE "activity_evidence_reviews" (
    "id" SERIAL NOT NULL,
    "activityId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "evidenceUserId" INTEGER NOT NULL,
    "reviewerId" INTEGER,
    "decision" VARCHAR(20) NOT NULL,
    "steps" JSONB,
    "notes" TEXT NOT NULL,
    "score" INTEGER,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_evidence_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "activity_evidence_reviews_activityId_idx" ON "activity_evidence_reviews"("activityId");
CREATE INDEX "activity_evidence_reviews_companyId_idx" ON "activity_evidence_reviews"("companyId");
CREATE INDEX "activity_evidence_reviews_evidenceUserId_idx" ON "activity_evidence_reviews"("evidenceUserId");

ALTER TABLE "activity_evidence_reviews"
  ADD CONSTRAINT "activity_evidence_reviews_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "activity_evidence_reviews"
  ADD CONSTRAINT "activity_evidence_reviews_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activity_evidence_reviews"
  ADD CONSTRAINT "activity_evidence_reviews_evidenceUserId_fkey"
  FOREIGN KEY ("evidenceUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "activity_evidence_reviews"
  ADD CONSTRAINT "activity_evidence_reviews_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
