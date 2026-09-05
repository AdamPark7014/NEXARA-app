-- Dos campos que el equipo YA mandaba en cada aviso y que el parser tiraba.
--
-- Documentados por el fabricante en el Apendice A.49 del
-- `API_Developer Guide_V1.8.0_20250109` (JSON_EventNotificationAlert_
-- fielddetection), los dos como campos requeridos de la envoltura:
--
--   eventState       "Durative alarm/event status: active-valid,
--                     inactive-invalid ... the alarm/event information will be
--                     uploaded continuously until the status is set to
--                     inactive"
--   activePostCount  "Number of times that the same alarm has been triggered"
--
-- `eventState` sustituye la heuristica de TTL del overlay (BOX_TTL_OPTICAL_MS):
-- el equipo avisa cuando el objetivo se va, no hay que suponerlo.
-- Columna de texto y no enum: un firmware distinto puede traer otro valor y
-- vale mas guardarlo que perder el evento entero.
ALTER TABLE "integra_push_events" ADD COLUMN IF NOT EXISTS "eventState" VARCHAR(16);
ALTER TABLE "integra_push_events" ADD COLUMN IF NOT EXISTS "activePostCount" INTEGER;

-- Overlay: "que sigue activo ahora mismo" sin escanear la ventana entera.
CREATE INDEX IF NOT EXISTS "integra_push_events_siteId_eventState_occurredAt_idx"
  ON "integra_push_events"("siteId", "eventState", "occurredAt");
