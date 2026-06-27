-- Elimina definitivamente los 9 usuarios legacy inactivos (onboarding viejo).
-- Ejecutar: ./deploy/nexara.sh delete-ghost-users

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

UPDATE "User" SET "managerId" = NULL
WHERE "managerId" IN (SELECT id FROM _ghost);

-- FKs opcionales → NULL
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
      AND cl.relname <> 'User'
      AND NOT att.attnotnull
  LOOP
    EXECUTE format(
      'UPDATE %s SET %s = NULL WHERE %s IN (SELECT id FROM _ghost)',
      r.fq_table, r.col, r.col
    );
  END LOOP;
END $nullify$;

-- Filas hijas con FK obligatoria hacia User (varias pasadas por FKs anidadas)
DO $purge$
DECLARE
  r RECORD;
  deleted BIGINT;
  pass_num INT;
  total_pass BIGINT;
BEGIN
  FOR pass_num IN 1..8 LOOP
    total_pass := 0;
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
        AND cl.relname <> 'User'
        AND att.attnotnull
    LOOP
      EXECUTE format(
        'DELETE FROM %s WHERE %s IN (SELECT id FROM _ghost)',
        r.fq_table, r.col
      );
      GET DIAGNOSTICS deleted = ROW_COUNT;
      total_pass := total_pass + deleted;
      IF deleted > 0 THEN
        RAISE NOTICE 'pass %: DELETE % filas de %.%', pass_num, deleted, r.fq_table, r.col;
      END IF;
    END LOOP;
    EXIT WHEN total_pass = 0;
  END LOOP;
END $purge$;

DELETE FROM "User" WHERE id IN (SELECT id FROM _ghost);

DO $$
DECLARE
  remaining INT;
  ghosts_left INT;
BEGIN
  SELECT COUNT(*) INTO remaining FROM "User";
  SELECT COUNT(*) INTO ghosts_left FROM _ghost g JOIN "User" u ON u.id = g.id;
  RAISE NOTICE 'Usuarios restantes: % (fantasmas restantes: %)', remaining, ghosts_left;
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
