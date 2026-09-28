-- Abre, de forma TEMPORAL, la posibilidad de checar entrada y salida desde la web en UNA empresa.
--
--   psql -v company_id=<id de company_profiles> -v hours=48 -f set-web-checkin-window.sql
--
-- Por decisión del dueño nadie checa desde el navegador (la ubicación de una pestaña se falsea y de las
-- checadas sale la nómina). Esta es una excepción con fecha de vencimiento: pasadas `hours` horas se
-- CIERRA SOLA, sin hacer nada. Mientras dura:
--   · «Asistencias → Mi jornada» muestra el formulario con cámara y ubicación;
--   · cada checada hecha así queda con origen WEB y validación PENDIENTE
--     («Checada desde el navegador (habilitada temporalmente)») para que RH la revise;
--   · las demás reglas siguen (foto obligatoria, viaje imposible, ubicación vieja…).
--
-- Cerrarla antes:  DELETE FROM system_settings WHERE key = 'attendance.web_checkin_until' AND "companyId" = <id>;
-- Ampliarla: volver a correr este script con otras horas.
\set ON_ERROR_STOP on

INSERT INTO system_settings (key, value, category, label, "companyId", "createdAt", "updatedAt")
VALUES (
  'attendance.web_checkin_until',
  to_char((now() + make_interval(hours => :hours)) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'attendance',
  'Checar desde la web hasta',
  :company_id,
  now(),
  now()
)
ON CONFLICT (key, "companyId") DO UPDATE
  SET value = EXCLUDED.value, "updatedAt" = now();

SELECT id, key, value AS "abierta hasta (UTC)", "companyId" FROM system_settings
WHERE key = 'attendance.web_checkin_until' AND "companyId" = :company_id;
