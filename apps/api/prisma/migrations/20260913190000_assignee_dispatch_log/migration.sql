-- Registro de despacho: quién sumó a cada persona al equipo («Luis la pasó a Antonio»).
ALTER TABLE "activity_assignees" ADD COLUMN "asignadoPorId" INTEGER;

ALTER TABLE "activity_assignees"
  ADD CONSTRAINT "activity_assignees_asignadoPorId_fkey"
  FOREIGN KEY ("asignadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: al responsable lo sumó quien creó la actividad.
UPDATE "activity_assignees" a
SET "asignadoPorId" = act."creadoPorId"
FROM "Activity" act
WHERE act.id = a."activityId"
  AND a."userId" = act."responsableId"
  AND a."asignadoPorId" IS NULL;

-- En despacho, quien reparte (LEAD) no sube evidencia: quita sus filas sin ningún avance.
DELETE FROM "activity_evidences" e
USING "activity_assignees" a, "Activity" act
WHERE a."activityId" = e."activityId"
  AND a."userId" = e."userId"
  AND act.id = e."activityId"
  AND act."assignmentCharge" = 'despacho'
  AND a.rol = 'LEAD'
  AND e.status = 'ENTRY_PHOTO'
  AND e."entryPhotoUrl" IS NULL
  AND cardinality(e."evidencePhotos") = 0;
