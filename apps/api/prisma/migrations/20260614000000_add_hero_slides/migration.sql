-- ============================================================================
-- Hero del sitio público — slides editables desde Studio
-- ============================================================================
-- Tabla que respalda el carrusel del home (`/`). El frontend
-- (`apps/web/app/components/HeroCarousel.tsx`) consume el endpoint público
-- `GET /api/hero-slides/public` para listar los slides activos en orden.
--
-- Si la tabla está vacía o el endpoint falla, el componente cae a su set
-- de slides hardcodeados (`/images/hero/hero-0X.png`). Hacemos seed con
-- esas 8 imágenes para que el carrusel se vea idéntico al estado actual
-- desde el primer despliegue y permita ediciones inmediatas.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "hero_slides" (
  "id"        SERIAL PRIMARY KEY,
  "imageUrl"  VARCHAR(500) NOT NULL,
  "altText"   VARCHAR(200),
  "caption"   VARCHAR(500),
  "href"      VARCHAR(500),
  "position"  INTEGER NOT NULL DEFAULT 0,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "hero_slides_position_idx" ON "hero_slides"("position");
CREATE INDEX IF NOT EXISTS "hero_slides_isActive_idx" ON "hero_slides"("isActive");

-- Seed inicial idempotente: solo inserta si la tabla está vacía.
INSERT INTO "hero_slides" ("imageUrl", "altText", "position", "isActive")
SELECT * FROM (VALUES
  ('/images/hero/hero-01.png', 'Equipo Nexara en operación',           1, true),
  ('/images/hero/hero-02.png', 'Instalación de infraestructura en sitio', 2, true),
  ('/images/hero/hero-03.png', 'Ingenieros Nexara en campo',           3, true),
  ('/images/hero/hero-04.png', 'Solución de monitoreo perimetral',     4, true),
  ('/images/hero/hero-05.png', 'Instalación de gabinetes y racks',     5, true),
  ('/images/hero/hero-06.png', 'Despliegue de red empresarial',        6, true),
  ('/images/hero/hero-07.png', 'Centro de monitoreo NOC 24/7',         7, true),
  ('/images/hero/hero-08.png', 'Cobertura tecnológica metropolitana',  8, true)
) AS seed("imageUrl", "altText", "position", "isActive")
WHERE NOT EXISTS (SELECT 1 FROM "hero_slides");
