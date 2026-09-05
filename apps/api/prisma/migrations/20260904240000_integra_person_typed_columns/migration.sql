-- Promote to real columns what lived buried inside `integra_people.raw`.
-- A JSONB blob cannot be filtered, ordered or indexed: nobody could ask
-- "who expires this month" without loading every row into memory.
-- `raw` stays as a safety net (RightPlan, doorRight and firmware extras).
-- Every column is nullable on purpose: existing rows must not break.
ALTER TABLE "integra_people" ADD COLUMN IF NOT EXISTS "gender" VARCHAR(32);
ALTER TABLE "integra_people" ADD COLUMN IF NOT EXISTS "userType" VARCHAR(64);
ALTER TABLE "integra_people" ADD COLUMN IF NOT EXISTS "validEnable" BOOLEAN;
ALTER TABLE "integra_people" ADD COLUMN IF NOT EXISTS "validFrom" TIMESTAMP(3);
ALTER TABLE "integra_people" ADD COLUMN IF NOT EXISTS "validTo" TIMESTAMP(3);
ALTER TABLE "integra_people" ADD COLUMN IF NOT EXISTS "numOfFace" INTEGER;
ALTER TABLE "integra_people" ADD COLUMN IF NOT EXISTS "numOfFP" INTEGER;
ALTER TABLE "integra_people" ADD COLUMN IF NOT EXISTS "numOfCard" INTEGER;
ALTER TABLE "integra_people" ADD COLUMN IF NOT EXISTS "faceUrl" VARCHAR(500);
ALTER TABLE "integra_people" ADD COLUMN IF NOT EXISTS "sourceIp" VARCHAR(64);

-- Backfill from `raw` so the columns are useful before the next sync runs.
-- `->>` yields NULL when the key is absent, which is exactly what we want.
UPDATE "integra_people"
SET
  "gender"      = COALESCE("gender", NULLIF("raw" ->> 'gender', '')),
  "userType"    = COALESCE("userType", NULLIF("raw" ->> 'userType', '')),
  "faceUrl"     = COALESCE("faceUrl", NULLIF("raw" ->> 'faceURL', '')),
  "sourceIp"    = COALESCE("sourceIp", NULLIF("raw" ->> 'sourceIp', '')),
  "validEnable" = COALESCE("validEnable", ("raw" -> 'Valid' ->> 'enable')::BOOLEAN)
WHERE "raw" IS NOT NULL AND jsonb_typeof("raw") = 'object';

-- Numbers and timestamps go in their own pass: a single malformed value would
-- abort the whole UPDATE, so each cast is guarded by a shape check first.
UPDATE "integra_people"
SET
  "numOfFace" = COALESCE("numOfFace", ("raw" ->> 'numOfFace')::INTEGER),
  "numOfFP"   = COALESCE("numOfFP",   ("raw" ->> 'numOfFP')::INTEGER),
  "numOfCard" = COALESCE("numOfCard", ("raw" ->> 'numOfCard')::INTEGER)
WHERE "raw" IS NOT NULL
  AND jsonb_typeof("raw") = 'object'
  AND COALESCE("raw" ->> 'numOfFace', '0') ~ '^[0-9]+$'
  AND COALESCE("raw" ->> 'numOfFP', '0') ~ '^[0-9]+$'
  AND COALESCE("raw" ->> 'numOfCard', '0') ~ '^[0-9]+$';

-- `Valid.beginTime` / `endTime` come as `2020-01-01T00:00:00` (device local
-- time, no zone). Only cast values that really look like that.
UPDATE "integra_people"
SET "validFrom" = COALESCE("validFrom", ("raw" -> 'Valid' ->> 'beginTime')::TIMESTAMP(3))
WHERE "raw" IS NOT NULL
  AND jsonb_typeof("raw") = 'object'
  AND ("raw" -> 'Valid' ->> 'beginTime') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}';

UPDATE "integra_people"
SET "validTo" = COALESCE("validTo", ("raw" -> 'Valid' ->> 'endTime')::TIMESTAMP(3))
WHERE "raw" IS NOT NULL
  AND jsonb_typeof("raw") = 'object'
  AND ("raw" -> 'Valid' ->> 'endTime') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}';

-- `orgName` carried the userType by mistake (integra-sync wrote
-- `orgName: String(u.userType)`). It is the DEPARTMENT column; free it on the
-- rows where it is a literal ACS userType so real data can land there.
UPDATE "integra_people"
SET "orgName" = NULL
WHERE "orgName" IS NOT NULL
  AND "orgName" = "userType"
  AND "orgName" IN ('normal', 'visitor', 'blackList', 'patrol');

-- Vencimientos próximos por empresa sin escanear la tabla.
CREATE INDEX IF NOT EXISTS "integra_people_companyId_validTo_idx"
  ON "integra_people"("companyId", "validTo");

-- Segmentar por tipo de usuario dentro de un sitio.
CREATE INDEX IF NOT EXISTS "integra_people_siteId_userType_idx"
  ON "integra_people"("siteId", "userType");
