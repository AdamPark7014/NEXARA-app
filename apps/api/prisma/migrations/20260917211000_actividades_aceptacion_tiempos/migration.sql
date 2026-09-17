-- Actividades: aceptar/rechazar la asignación, tiempo planeado vs real y orden de prioridad.
-- Todo es aditivo: la app 1.0.2 (sin botón de aceptar) sigue funcionando igual.

ALTER TABLE "activity_assignees" ADD COLUMN IF NOT EXISTS "aceptadaAt" TIMESTAMP(3);
ALTER TABLE "activity_assignees" ADD COLUMN IF NOT EXISTS "rechazadaAt" TIMESTAMP(3);
ALTER TABLE "activity_assignees" ADD COLUMN IF NOT EXISTS "motivoRechazo" VARCHAR(500);
ALTER TABLE "activity_assignees" ADD COLUMN IF NOT EXISTS "inicioRealAt" TIMESTAMP(3);
ALTER TABLE "activity_assignees" ADD COLUMN IF NOT EXISTS "finRealAt" TIMESTAMP(3);
ALTER TABLE "activity_assignees" ADD COLUMN IF NOT EXISTS "distanciaSitioInicioM" INTEGER;
ALTER TABLE "activity_assignees" ADD COLUMN IF NOT EXISTS "saltoPrioridad" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "activity_assignees" ADD COLUMN IF NOT EXISTS "justificacionOrden" VARCHAR(500);
ALTER TABLE "activity_assignees" ADD COLUMN IF NOT EXISTS "alertaExcesoAt" TIMESTAMP(3);

-- Lo ya trabajado no queda «pendiente de aceptar»: quien subió la foto de entrada la aceptó de hecho,
-- y ese mismo momento es su inicio real (la foto de salida, su fin).
UPDATE "activity_assignees" a
SET
  "aceptadaAt" = COALESCE(a."aceptadaAt", e."entryPhotoUploadedAt"),
  "inicioRealAt" = COALESCE(a."inicioRealAt", e."entryPhotoUploadedAt"),
  "finRealAt" = COALESCE(a."finRealAt", e."exitPhotoUploadedAt")
FROM "activity_evidences" e
WHERE e."activityId" = a."activityId"
  AND e."userId" = a."userId"
  AND e."entryPhotoUploadedAt" IS NOT NULL;

-- Prioridad normalizada a ALTA | MEDIA | BAJA (se aceptan los textos viejos al leer y al escribir).
UPDATE "Activity"
SET "prioridad" = CASE
  WHEN lower(trim("prioridad")) IN ('alta', 'urgente', 'critica', 'crítica', 'p0', 'p1', 'high', 'urgent') THEN 'ALTA'
  WHEN lower(trim("prioridad")) IN ('baja', 'low', 'p3', 'p4') THEN 'BAJA'
  ELSE 'MEDIA'
END
WHERE "prioridad" IS NOT NULL
  AND "prioridad" NOT IN ('ALTA', 'MEDIA', 'BAJA');

-- Avisos nuevos (aceptó, rechazó, excedió su tiempo, inició fuera de sitio o fuera de orden).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACTIVITY_ACCEPTED_BY_ASSIGNEE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACTIVITY_REJECTED_BY_ASSIGNEE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACTIVITY_OVERTIME';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACTIVITY_START_FLAGGED';
