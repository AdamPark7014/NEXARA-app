-- Cierra jornadas abiertas (AttendanceDay.isOpen = true) para un usuario.
-- Replica la lógica de salida: inserta registro "salida", acumula minutos y apaga GPS.
--
-- Servidor:
--   ./deploy/nexara.sh close-attendance soporte@nexara.com.mx

\set ON_ERROR_STOP on

BEGIN;

DO $close$
DECLARE
  v_email TEXT := lower(trim(:'user_email'));
  v_user_id INT;
  rec RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_duration INT;
BEGIN
  IF v_email IS NULL OR v_email = '' OR v_email = ':''user_email''' THEN
    RAISE EXCEPTION 'Indica email: ./deploy/nexara.sh close-attendance usuario@nexara.com.mx';
  END IF;

  SELECT id INTO v_user_id FROM "User" WHERE lower(email) = v_email;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado: %', v_email;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "AttendanceDay" WHERE "userId" = v_user_id AND "isOpen" = true
  ) THEN
    RAISE NOTICE 'Sin jornada abierta para % (id=%)', v_email, v_user_id;
    RETURN;
  END IF;

  FOR rec IN
    SELECT id, "lastEntryAt", date, "totalMinutes"
    FROM "AttendanceDay"
    WHERE "userId" = v_user_id AND "isOpen" = true
    ORDER BY date ASC
  LOOP
    v_duration := 0;
    IF rec."lastEntryAt" IS NOT NULL THEN
      v_duration := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_now - rec."lastEntryAt")) / 60.0)::INT);
    END IF;

    INSERT INTO "Attendance" ("userId", type, "timestamp", "deviceInfo")
    VALUES (v_user_id, 'salida', v_now, 'Cierre administrativo (script)');

    UPDATE "AttendanceDay"
    SET
      "isOpen" = false,
      "lastEntryAt" = NULL,
      "totalMinutes" = COALESCE(rec."totalMinutes", 0) + v_duration
    WHERE id = rec.id;

    RAISE NOTICE 'Jornada cerrada: user=% day=% +% min', v_email, rec.date, v_duration;
  END LOOP;

  UPDATE "User" SET "locationConsent" = false WHERE id = v_user_id;

  UPDATE "LocationTracking"
  SET "estaActivo" = false, "ultimaActualizacion" = v_now
  WHERE "usuarioId" = v_user_id AND "estaActivo" = true;
END
$close$;

COMMIT;
