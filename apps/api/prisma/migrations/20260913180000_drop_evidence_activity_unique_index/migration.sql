-- Evidencia por persona: quita la unicidad vieja 1:1 por actividad.
-- 20260912010000_evidence_per_user_core_kind solo borraba *constraints* únicos, pero
-- Prisma la había creado como *índice* único ("activity_evidences_activityId_key"),
-- así que sobrevivía y sumar a una 2.ª persona al equipo fallaba con P2002 (409).
DROP INDEX IF EXISTS "activity_evidences_activityId_key";

-- Por si en algún entorno sí quedó como constraint con otro nombre.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT i.relname AS indexname
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    WHERE t.relname = 'activity_evidences'
      AND x.indisunique
      AND NOT x.indisprimary
      AND pg_get_indexdef(x.indexrelid) LIKE '%("activityId")'
  LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.indexname) THEN
      EXECUTE format('ALTER TABLE activity_evidences DROP CONSTRAINT %I', r.indexname);
    ELSE
      EXECUTE format('DROP INDEX IF EXISTS %I', r.indexname);
    END IF;
  END LOOP;
END $$;
