-- Una entrada y una salida por jornada, exigido por la base.
--
-- El servicio comprobaba primero y creaba después, y entre las dos cosas caben
-- dos peticiones: un doble toque en el móvil o un reintento por red mala
-- creaban ambas. No es hipotético — en producción hay un usuario con dos
-- salidas el mismo día — y de estos registros sale la nómina.
--
-- `timestamp::date` no se puede indexar convirtiendo zonas (la conversión no es
-- inmutable en Postgres), así que el día se guarda ya resuelto en `workDate`.

-- 1) Columna nueva, nulable: ninguna fila existente se invalida.
ALTER TABLE "Attendance" ADD COLUMN "workDate" DATE;

-- 2) Relleno con el mismo criterio de día que usa hoy el servicio.
--
--    El contenedor corre en UTC y el código calcula el día con `setHours(0,0,0,0)`
--    sobre hora local, así que hoy la jornada ES el día UTC. Se rellena igual
--    para no cambiar de golpe ningún cálculo de nómina; que el día deba medirse
--    en hora de México es una decisión aparte, todavía pendiente.
UPDATE "Attendance" SET "workDate" = ("timestamp")::date WHERE "workDate" IS NULL;

-- 3) Duplicados que ya existen: sin esto el índice no se puede crear.
--
--    Se conserva el registro que hace la jornada más larga —la entrada más
--    temprana y la salida más tardía—, que es como se calculan las horas. Los
--    demás se marcan moviéndolos a `workDate` nulo en vez de borrarlos: siguen
--    consultables y la nómina de un periodo ya cerrado no cambia sola.
WITH ordenados AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "companyId", "userId", "workDate", "type"
           ORDER BY CASE WHEN "type" = 'entrada' THEN "timestamp" END ASC,
                    CASE WHEN "type" <> 'entrada' THEN "timestamp" END DESC
         ) AS pos
    FROM "Attendance"
   WHERE "workDate" IS NOT NULL
)
UPDATE "Attendance" a
   SET "workDate" = NULL
  FROM ordenados o
 WHERE a.id = o.id AND o.pos > 1;

-- 4) Ahora sí, la regla.
--    En Postgres los NULL no chocan entre sí, así que los duplicados apartados
--    en el paso 3 conviven sin bloquear el índice.
CREATE UNIQUE INDEX "Attendance_companyId_userId_workDate_type_key"
  ON "Attendance"("companyId", "userId", "workDate", "type");
