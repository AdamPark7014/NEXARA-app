-- Solicitudes de equipo entre pares (Ola C). Aditivo: no toca Activity ni el rechazo 403 de OT del jefe.

CREATE TYPE "ActivityPeerRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

CREATE TABLE IF NOT EXISTS "activity_peer_requests" (
  "id" SERIAL NOT NULL,
  "fromUserId" INTEGER NOT NULL,
  "toUserId" INTEGER NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "status" "ActivityPeerRequestStatus" NOT NULL DEFAULT 'PENDING',
  "rejectReason" VARCHAR(500),
  "activityId" INTEGER,
  "companyId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_peer_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "activity_peer_requests_companyId_status_idx" ON "activity_peer_requests"("companyId", "status");
CREATE INDEX IF NOT EXISTS "activity_peer_requests_fromUserId_status_idx" ON "activity_peer_requests"("fromUserId", "status");
CREATE INDEX IF NOT EXISTS "activity_peer_requests_toUserId_status_idx" ON "activity_peer_requests"("toUserId", "status");
CREATE INDEX IF NOT EXISTS "activity_peer_requests_activityId_idx" ON "activity_peer_requests"("activityId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_peer_requests_fromUserId_fkey') THEN
    ALTER TABLE "activity_peer_requests"
      ADD CONSTRAINT "activity_peer_requests_fromUserId_fkey"
      FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_peer_requests_toUserId_fkey') THEN
    ALTER TABLE "activity_peer_requests"
      ADD CONSTRAINT "activity_peer_requests_toUserId_fkey"
      FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_peer_requests_activityId_fkey') THEN
    ALTER TABLE "activity_peer_requests"
      ADD CONSTRAINT "activity_peer_requests_activityId_fkey"
      FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_peer_requests_companyId_fkey') THEN
    ALTER TABLE "activity_peer_requests"
      ADD CONSTRAINT "activity_peer_requests_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;
