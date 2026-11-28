-- Fija cuántos DÍAS se conserva la bitácora (`audit_logs`) antes de que la purga semanal borre lo más viejo.
--
--   psql -v dias=180 -f set-retencion-bitacora.sql
--
-- El número lo decide Adam. Mientras no haya fila rige 90 (lo que de hecho aplicaba el borrado de los domingos antes de
-- tener un solo lugar donde cambiarlo). No hace falta desplegar: el API lee la fila con una caché de 5 minutos.
--
--   · Piso 30 y techo 3650: este script solo acepta un entero entre los dos. El API, si encuentra una fila escrita a
--     mano que no es un entero ('1 año', '365 días'), NO adivina: avisa en el log, conserva el último número válido
--     que conocía y, si no conoce ninguno, no borra nada hasta que se corrija (la tarea sale como fallida). Un entero
--     fuera de rango se lleva a 30 o a 3650.
--   · Para FRENAR el borrado un tiempo se sube el número (3650); no existe un «nunca borrar» a propósito, porque una
--     bitácora sin límite acaba llenando el disco.
--   · La purga corre los domingos a las 04:15 de México, borra por lotes de 5,000 y hasta 40 lotes por corrida
--     (200,000 filas); lo que sobre se borra el domingo siguiente. En el log queda una línea con «Bitácora:» y la cuenta.
--   · Es update-o-insert a propósito y NO un upsert: `system_settings` es único por (key, companyId), pero con
--     `companyId` nulo Postgres permite duplicados y `ON CONFLICT` no los detecta. El API lee CUALQUIER fila con esta
--     clave y manda la más recientemente tocada, y este script la toca con `now()`.
--   · Volver a la omisión (90): DELETE FROM system_settings WHERE key = 'audit.retencion_dias';
\set ON_ERROR_STOP on

SELECT coalesce((substring(:'dias' from '^[0-9]{1,4}$'))::int BETWEEN 30 AND 3650, false) AS dias_validos \gset
\if :dias_validos
\else
  \echo 'Pasa un entero de días entre 30 y 3650: psql -v dias=180 -f set-retencion-bitacora.sql'
  \quit
\endif

UPDATE system_settings
SET value = :'dias', "updatedAt" = now()
WHERE key = 'audit.retencion_dias' AND "companyId" IS NULL;

INSERT INTO system_settings (key, value, category, label, "companyId", "createdAt", "updatedAt")
SELECT 'audit.retencion_dias', :'dias', 'sistema', 'Retención de la bitácora en días', NULL, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM system_settings WHERE key = 'audit.retencion_dias' AND "companyId" IS NULL
);

SELECT id, key, value AS "días", "companyId", "updatedAt" FROM system_settings
WHERE key = 'audit.retencion_dias'
ORDER BY "updatedAt" DESC, id DESC;
