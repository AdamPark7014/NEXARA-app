-- La jornada laboral se mide en hora de México, no en UTC.
--
-- El contenedor corre en UTC y el código calculaba el día con hora local, que
-- ahí es UTC. Con la empresa operando en México eso parte jornadas normales en
-- dos: una entrada a las 16:07 y su salida a las 19:18 del mismo día caían en
-- días UTC distintos, porque la salida ya es 01:18 UTC del siguiente.
--
-- En los datos existentes, 10 de 15 registros caían en un día distinto según se
-- midiera de una u otra forma. El síntoma eran jornadas que nunca cerraban y
-- minutos acumulados al día equivocado — y de `attendance_days.totalMinutes`
-- sale directamente la nómina.
--
-- No toca ninguna estructura: sólo corrige datos.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Se vacía primero el día laboral de todos los registros.
--
--    Recalcularlos con un UPDATE masivo directo choca contra el índice único a
--    mitad de la sentencia: al desplazarse los días, dos filas coinciden un
--    instante aunque el resultado final sea válido. Los nulos, en cambio, no
--    chocan entre sí en Postgres, así que este paso siempre pasa.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE "Attendance" SET "workDate" = NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Se asigna el día —ya en hora de México— sólo al ganador de cada grupo.
--
--    Se conserva el que hace la jornada más larga: entrada más temprana,
--    salida más tardía, que es como se calculan las horas. Los demás quedan
--    con `workDate` nulo, así que siguen consultables sin bloquear el índice.
-- ─────────────────────────────────────────────────────────────────────────
WITH candidatos AS (
  SELECT id,
         ("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City')::date AS dia,
         ROW_NUMBER() OVER (
           PARTITION BY "companyId", "userId",
                        ("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City')::date,
                        "type"
           ORDER BY CASE WHEN "type" = 'entrada' THEN "timestamp" END ASC,
                    CASE WHEN "type" <> 'entrada' THEN "timestamp" END DESC
         ) AS pos
    FROM "Attendance"
)
UPDATE "Attendance" a
   SET "workDate" = c.dia
  FROM candidatos c
 WHERE a.id = c.id AND c.pos = 1;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Reconstrucción de las jornadas desde los registros.
--
--    `attendance_days` es dato derivado: la fuente real es `Attendance`. Las
--    filas actuales arrastran el error —hay una con 42 629 minutos, casi 30
--    días acumulados en una sola jornada porque nunca se cerró—, así que se
--    recalculan en vez de intentar corregirlas una a una.
--
--    Una jornada sin salida queda abierta y con cero minutos: no se inventa
--    una duración que nadie registró.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE jornadas_nuevas ON COMMIT DROP AS
SELECT e."companyId",
       e."userId",
       e."workDate" AS date,
       e."timestamp" AS entrada_at,
       s."timestamp" AS salida_at,
       COALESCE(
         GREATEST(0, CEIL(EXTRACT(EPOCH FROM (s."timestamp" - e."timestamp")) / 60)::int),
         0
       ) AS total_minutes
  FROM "Attendance" e
  LEFT JOIN "Attendance" s
         ON s."companyId" = e."companyId"
        AND s."userId"    = e."userId"
        AND s."workDate"  = e."workDate"
        AND s."type"      = 'salida'
 WHERE e."type" = 'entrada' AND e."workDate" IS NOT NULL;

DELETE FROM "AttendanceDay";

INSERT INTO "AttendanceDay" ("userId", date, "totalMinutes", "lastEntryAt", "isOpen", "companyId")
SELECT "userId",
       date,
       total_minutes,
       entrada_at,
       salida_at IS NULL,
       "companyId"
  FROM jornadas_nuevas;
