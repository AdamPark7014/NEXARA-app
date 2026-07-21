-- Studio NEXARA: draft/publish en PageContent (módulo existente)

ALTER TABLE "page_content" ADD COLUMN IF NOT EXISTS "draftContent" JSONB;
ALTER TABLE "page_content" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
ALTER TABLE "page_content" ADD COLUMN IF NOT EXISTS "publishedBy" VARCHAR(255);

-- Backfill: lo ya publicado queda como draft + published
UPDATE "page_content"
SET "draftContent" = "content"
WHERE "draftContent" IS NULL;

UPDATE "page_content"
SET "publishedAt" = COALESCE("publishedAt", "updatedAt")
WHERE "publishedAt" IS NULL;
