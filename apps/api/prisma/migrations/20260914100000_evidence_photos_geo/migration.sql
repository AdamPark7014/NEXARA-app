-- Ubicación GPS de cada foto de evidencia (mismo orden que "evidencePhotos").
ALTER TABLE "activity_evidences" ADD COLUMN "evidencePhotosGeo" JSONB;
