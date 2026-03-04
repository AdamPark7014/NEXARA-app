DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContactCategory') THEN
        CREATE TYPE "ContactCategory" AS ENUM ('SOPORTE', 'VENTAS');
    END IF;
END $$;

ALTER TABLE "contact_messages"
ADD COLUMN IF NOT EXISTS "category" "ContactCategory" NOT NULL DEFAULT 'SOPORTE';
