-- Elimina definitivamente los 9 usuarios legacy inactivos (onboarding viejo).
-- Ejecutar: ./deploy/nexara.sh delete-ghost-users
-- Requiere: isActive = false y email en la lista explícita (no borra organigrama).

BEGIN;

CREATE TEMP TABLE _ghost AS
SELECT id, email, nombre
FROM "User"
WHERE "isActive" = false
  AND LOWER(email) IN (
    'monica.garcia@nexara.com.mx',
    'direction.operaciones@nexara.com.mx',
    'jose.tapa@nexara.com.mx',
    'juan.carrillo@nexara.com.mx',
    'maria.sanchez@nexara.com.mx',
    'daniela.arevez@nexara.com.mx',
    'juana.sierra@nexara.com.mx',
    'maria.gonzalez@nexara.com.mx',
    'melisa.ramos@nexara.com.mx'
  );

DO $$
DECLARE
  n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM _ghost;
  IF n = 0 THEN
    RAISE EXCEPTION 'No se encontraron usuarios fantasma para eliminar (¿ya fueron borrados?)';
  END IF;
  RAISE NOTICE 'Eliminando % usuarios fantasma…', n;
END $$;

SELECT id, email, nombre FROM _ghost ORDER BY email;

-- Jerarquía: nadie reporta a un fantasma
UPDATE "User" SET "managerId" = NULL
WHERE "managerId" IN (SELECT id FROM _ghost);

-- Anular FKs opcionales hacia User (aprobador, owner, createdBy, etc.)
DO $nullify$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      quote_ident(nsp.nspname) || '.' || quote_ident(cl.relname) AS fq_table,
      quote_ident(att.attname) AS col
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = cl.relnamespace
    JOIN unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ck.attnum
    WHERE con.contype = 'f'
      AND con.confrelid = '"User"'::regclass
      AND nsp.nspname = 'public'
      AND NOT att.attnotnull
  LOOP
    EXECUTE format(
      'UPDATE %s SET %s = NULL WHERE %s IN (SELECT id FROM _ghost)',
      r.fq_table, r.col, r.col
    );
  END LOOP;
END $nullify$;

-- Filas hijas directas del usuario (tablas frecuentes)
DELETE FROM "UserPushEndpoint" WHERE "userId" IN (SELECT id FROM _ghost);
DELETE FROM "UserPreference" WHERE "userId" IN (SELECT id FROM _ghost);
DELETE FROM "UserDocument" WHERE "userId" IN (SELECT id FROM _ghost);
DELETE FROM "UserProfile" WHERE "userId" IN (SELECT id FROM _ghost);
DELETE FROM "Notification" WHERE "userId" IN (SELECT id FROM _ghost);
DELETE FROM "Attendance" WHERE "userId" IN (SELECT id FROM _ghost);
DELETE FROM "AttendanceDay" WHERE "userId" IN (SELECT id FROM _ghost);
DELETE FROM "LunchBreak" WHERE "userId" IN (SELECT id FROM _ghost);
DELETE FROM "AuditLog" WHERE "userId" IN (SELECT id FROM _ghost);
DELETE FROM "EmployeePayment" WHERE "userId" IN (SELECT id FROM _ghost);
DELETE FROM "ToolKitUserAssignment" WHERE "userId" IN (SELECT id FROM _ghost);
DELETE FROM "ToolRequestNotification" WHERE "usuarioId" IN (SELECT id FROM _ghost);
DELETE FROM "ToolRequest" WHERE "usuarioId" IN (SELECT id FROM _ghost);
DELETE FROM "CrmActivity" WHERE "ownerId" IN (SELECT id FROM _ghost) OR "createdById" IN (SELECT id FROM _ghost);

-- Actividades/evidencias/viáticos si los fantasmas llegaron a tener datos demo
DELETE FROM "Evidence" WHERE "userId" IN (SELECT id FROM _ghost);
DELETE FROM "Viatico" WHERE "usuarioId" IN (SELECT id FROM _ghost);
DELETE FROM "Activity" WHERE "creadoPorId" IN (SELECT id FROM _ghost)
   OR "responsableId" IN (SELECT id FROM _ghost);

DELETE FROM "User" WHERE id IN (SELECT id FROM _ghost);

DO $$
DECLARE
  remaining INT;
BEGIN
  SELECT COUNT(*) INTO remaining FROM "User";
  RAISE NOTICE 'Usuarios restantes en DB: % (esperado: 16)', remaining;
END $$;

COMMIT;

\echo '=== Verificación post-borrado ==='
SELECT COUNT(*) AS total_usuarios FROM "User";
SELECT COUNT(*) AS fantasmas_restantes FROM "User"
WHERE LOWER(email) IN (
  'monica.garcia@nexara.com.mx',
  'direction.operaciones@nexara.com.mx',
  'jose.tapa@nexara.com.mx',
  'juan.carrillo@nexara.com.mx',
  'maria.sanchez@nexara.com.mx',
  'daniela.arevez@nexara.com.mx',
  'juana.sierra@nexara.com.mx',
  'maria.gonzalez@nexara.com.mx',
  'melisa.ramos@nexara.com.mx'
);
