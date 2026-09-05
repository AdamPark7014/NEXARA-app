-- Perfil de deteccion por camara. Hasta ahora la deteccion no estaba
-- parametrizada: era una plantilla fija aplicada a ciegas a todos los equipos
-- (region = fotograma completo, sensitivityLevel = 100, una sola de las cuatro
-- zonas que admite el equipo). Sensibilidad maxima sobre todo el encuadre
-- detecta la calle, el reflejo y el estacionamiento igual que la puerta.
--
-- Sin fila aqui, el cableado usa la plantilla de compatibilidad, asi que un
-- sitio sin perfiles sigue funcionando como antes.
CREATE TABLE IF NOT EXISTS "integra_detection_profiles" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    -- `cameraIndexCode` del espejo `integra_cameras`.
    "cameraId" VARCHAR(120) NOT NULL,
    "deviceIp" VARCHAR(64),
    "channel" INTEGER,
    -- eventType EXTRA del Apendice B, sobre la lista blanca base.
    "eventTypes" JSONB,
    -- sensitivityLevel 0..100 (DOCUMENTADO, Apendice A.49).
    "sensitivity" INTEGER,
    -- low | mediumLow | mediumHigh | high (EMPIRICO: el equipo devuelve el tag
    -- con opt=, pero no aparece en la documentacion del fabricante).
    "alarmConfidence" VARCHAR(24),
    -- human | vehicle | human,vehicle (DOCUMENTADO, Apendice A.49).
    "detectionTarget" VARCHAR(24),
    -- Hasta 4 poligonos normalizados 0..1.
    "regions" JSONB,
    "timeThresholdSec" INTEGER,
    -- Filtro de servidor: no hay tag verificado para escribirlo al equipo.
    "minTargetPct" DOUBLE PRECISION,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "schedule" JSONB,
    "lastAppliedAt" TIMESTAMP(3),
    "lastAppliedNote" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integra_detection_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "integra_detection_profiles_siteId_cameraId_key"
  ON "integra_detection_profiles"("siteId", "cameraId");

CREATE INDEX IF NOT EXISTS "integra_detection_profiles_companyId_siteId_idx"
  ON "integra_detection_profiles"("companyId", "siteId");

ALTER TABLE "integra_detection_profiles"
  DROP CONSTRAINT IF EXISTS "integra_detection_profiles_companyId_fkey";
ALTER TABLE "integra_detection_profiles"
  ADD CONSTRAINT "integra_detection_profiles_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "company_profile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "integra_detection_profiles"
  DROP CONSTRAINT IF EXISTS "integra_detection_profiles_siteId_fkey";
ALTER TABLE "integra_detection_profiles"
  ADD CONSTRAINT "integra_detection_profiles_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "integra_sites"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;


-- Espejo de `GET /ISAPI/Smart/capabilities`, que hasta hoy no se llamaba desde
-- ningun punto del codigo. Sin esto se planifica a ciegas: merodeo, zona,
-- objeto abandonado y desenfoque estaban en «no verificado», que no es lo
-- mismo que «no soportado».
--
-- Columnas reales y no `raw` JSON opaco: la gracia es poder preguntar «que
-- camaras admiten merodeo» con un WHERE. Cada flag es tri-estado —
-- true/false = el equipo lo dijo; NULL = el equipo NO lo dijo.
CREATE TABLE IF NOT EXISTS "integra_camera_capabilities" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "cameraId" VARCHAR(120) NOT NULL,
    "deviceIp" VARCHAR(64),
    "channel" INTEGER,
    "fieldDetection" BOOLEAN,
    "lineDetection" BOOLEAN,
    "faceDetect" BOOLEAN,
    "regionEntrance" BOOLEAN,
    "regionExiting" BOOLEAN,
    "loitering" BOOLEAN,
    "unattendedBaggage" BOOLEAN,
    "attendedBaggage" BOOLEAN,
    -- `group` en el Apendice B = aglomeracion de personas.
    "peopleGathering" BOOLEAN,
    "defocus" BOOLEAN,
    "sceneChange" BOOLEAN,
    "audioException" BOOLEAN,
    "peopleCounting" BOOLEAN,
    "heatMap" BOOLEAN,
    "supportedEventTypes" JSONB,
    "extra" JSONB,
    -- false = el equipo no contesto (403 notSupport en la PTZ DarkFighter).
    -- Tambien es informacion, por eso la fila se guarda igual.
    "probeOk" BOOLEAN NOT NULL DEFAULT false,
    "probeNote" VARCHAR(300),
    "probedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integra_camera_capabilities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "integra_camera_capabilities_siteId_cameraId_key"
  ON "integra_camera_capabilities"("siteId", "cameraId");

CREATE INDEX IF NOT EXISTS "integra_camera_capabilities_companyId_siteId_idx"
  ON "integra_camera_capabilities"("companyId", "siteId");

ALTER TABLE "integra_camera_capabilities"
  DROP CONSTRAINT IF EXISTS "integra_camera_capabilities_companyId_fkey";
ALTER TABLE "integra_camera_capabilities"
  ADD CONSTRAINT "integra_camera_capabilities_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "company_profile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "integra_camera_capabilities"
  DROP CONSTRAINT IF EXISTS "integra_camera_capabilities_siteId_fkey";
ALTER TABLE "integra_camera_capabilities"
  ADD CONSTRAINT "integra_camera_capabilities_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "integra_sites"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
