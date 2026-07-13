-- ============================================================================
-- Video de fondo del Hero del home — alternativa al carrusel de imágenes
-- ============================================================================
-- Singleton lógico gestionado desde Studio (`/studio/hero`): al subir un
-- video nuevo se reemplaza el anterior (fila + archivo físico). El toggle
-- que decide si el hero público muestra el carrusel (`hero_slides`) o este
-- video vive en `page_content` (section = "home_hero"), no aquí.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "hero_video" (
  "id"        SERIAL PRIMARY KEY,
  "videoUrl"  VARCHAR(500) NOT NULL,
  "posterUrl" VARCHAR(500),
  "title"     VARCHAR(200),
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "hero_video_isActive_idx" ON "hero_video"("isActive");
