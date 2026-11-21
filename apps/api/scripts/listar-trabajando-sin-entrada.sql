/**
 * Quién tiene hoy sesión de actividad abierta sin jornada abierta (solo lectura).
 * Adam decide; no cambia datos.
 *
 * Uso: psql / prisma studio / script con DATABASE_URL.
 */
SELECT
  u.id AS "userId",
  u.nombre,
  u.email,
  a.id AS "activityId",
  a."anNumber",
  a.titulo,
  s.id AS "sessionId",
  s."startedAt"
FROM "activity_work_sessions" s
JOIN "activities" a ON a.id = s."activityId"
JOIN "users" u ON u.id = s."userId"
WHERE s."endedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "attendance_days" d
    WHERE d."userId" = u.id
      AND d."isOpen" = true
  )
ORDER BY s."startedAt" DESC;
