-- Grabación de reuniones con notas en vivo y minuta con IA (Adam, 22-10-2026).
--
-- Un botón graba la junta; cada parte de ~1 minuto se transcribe con el whisper propio (el audio
-- se borra en cuanto se transcribe: aquí solo queda el texto), las notas se toman por tramos y al
-- concluir se escribe la minuta.
--
-- Aditiva: dos tablas nuevas con sus índices y llaves. Sin DROP, RENAME ni UPDATE. Idempotente.

CREATE TABLE IF NOT EXISTS "meeting_recordings" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'GRABANDO',
    "iniciadaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidaAt" TIMESTAMP(3),
    "notas" JSONB NOT NULL DEFAULT '[]',
    "notasHasta" INTEGER NOT NULL DEFAULT 0,
    "notasLease" TIMESTAMP(3),
    "minuta" JSONB,
    "minutaAt" TIMESTAMP(3),
    "error" VARCHAR(500),
    "usdIa" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tokensIa" INTEGER NOT NULL DEFAULT 0,
    "acuerdosConfirmadosAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_recordings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "meeting_recordings_meetingId_key" ON "meeting_recordings"("meetingId");
CREATE INDEX IF NOT EXISTS "meeting_recordings_companyId_estado_idx" ON "meeting_recordings"("companyId", "estado");

CREATE TABLE IF NOT EXISTS "meeting_recording_parts" (
    "id" SERIAL NOT NULL,
    "recordingId" INTEGER NOT NULL,
    "parte" INTEGER NOT NULL,
    "estado" VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE',
    "texto" TEXT,
    "palabras" INTEGER NOT NULL DEFAULT 0,
    "inicioMs" INTEGER,
    "duracionMs" INTEGER,
    "error" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transcritaAt" TIMESTAMP(3),

    CONSTRAINT "meeting_recording_parts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "meeting_recording_parts_recordingId_parte_key" ON "meeting_recording_parts"("recordingId", "parte");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_recordings_meetingId_fkey') THEN
    ALTER TABLE "meeting_recordings" ADD CONSTRAINT "meeting_recordings_meetingId_fkey"
      FOREIGN KEY ("meetingId") REFERENCES "operational_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_recording_parts_recordingId_fkey') THEN
    ALTER TABLE "meeting_recording_parts" ADD CONSTRAINT "meeting_recording_parts_recordingId_fkey"
      FOREIGN KEY ("recordingId") REFERENCES "meeting_recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
