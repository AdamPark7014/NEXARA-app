-- SystemSetting dual scope: platform (companyId null) + tenant override

ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'system_settings_key_key') THEN
    ALTER TABLE "system_settings" DROP CONSTRAINT "system_settings_key_key";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'system_settings_companyId_fkey') THEN
    ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "system_settings_key_companyId_key"
  ON "system_settings"("key", "companyId");

-- Enforce one platform row per key (NULL companyId)
CREATE UNIQUE INDEX IF NOT EXISTS "system_settings_key_platform_uidx"
  ON "system_settings"("key")
  WHERE "companyId" IS NULL;

CREATE INDEX IF NOT EXISTS "system_settings_companyId_idx" ON "system_settings"("companyId");
