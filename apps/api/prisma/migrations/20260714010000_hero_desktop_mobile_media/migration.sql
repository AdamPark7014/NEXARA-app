-- Hero media: variantes desktop + móvil (desktop = campos existentes)
ALTER TABLE "hero_slides"
  ADD COLUMN IF NOT EXISTS "imageUrlMobile" VARCHAR(500);

ALTER TABLE "hero_video"
  ADD COLUMN IF NOT EXISTS "videoUrlMobile" VARCHAR(500);
