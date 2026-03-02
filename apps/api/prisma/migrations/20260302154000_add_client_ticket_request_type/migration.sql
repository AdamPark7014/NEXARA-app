DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'ActivityWorkType'
  ) THEN
    CREATE TYPE "ActivityWorkType" AS ENUM ('ISSUE', 'PREVENTIVE_INVENTORY');
  END IF;
END $$;

ALTER TABLE "client_ticket_requests"
  ADD COLUMN IF NOT EXISTS "requestType" "ActivityWorkType" NOT NULL DEFAULT 'ISSUE';
