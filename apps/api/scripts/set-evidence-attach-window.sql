-- Abre, de forma TEMPORAL, la posibilidad de ADJUNTAR (en vez de tomar con la cámara) la foto de
-- entrada y la de salida de UNA actividad puntual.
--
--   psql -v activity_id=<id de Activity> -v company_id=<id de company_profile> -v hours=6 -f set-evidence-attach-window.sql
--
-- Por decisión del dueño la entrada y la salida solo se toman con la cámara en vivo (la galería se
-- puede falsear). Esta es una excepción puntual, con fecha de vencimiento: pasadas `hours` horas se
-- CIERRA SOLA, sin hacer nada. Mientras dura, esa actividad (nomás esa) ve un botón «Adjuntar
-- (excepción)» junto al de la cámara en los pasos 1 y 5.
--
-- Cerrarla antes: DELETE FROM system_settings WHERE key = 'evidence.allow_attach:<activity_id>' AND "companyId" = <id>;
-- Ampliarla: volver a correr este script con otras horas.
\set ON_ERROR_STOP on

INSERT INTO system_settings (key, value, category, label, "companyId", "createdAt", "updatedAt")
VALUES (
  'evidence.allow_attach:' || :activity_id,
  to_char((now() + make_interval(hours => :hours)) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'evidence',
  'Adjuntar entrada/salida (excepción) hasta',
  :company_id,
  now(),
  now()
)
ON CONFLICT (key, "companyId") DO UPDATE
  SET value = EXCLUDED.value, "updatedAt" = now();

SELECT id, key, value AS "abierta hasta (UTC)", "companyId" FROM system_settings
WHERE key = 'evidence.allow_attach:' || :activity_id AND "companyId" = :company_id;
