-- Create base tables for inventory flow if they do not exist yet
CREATE TABLE IF NOT EXISTS "inventory_snapshots" (
	"id" SERIAL NOT NULL,
	"clientId" INTEGER NOT NULL,
	"branchId" INTEGER NOT NULL,
	"requestId" INTEGER,
	"activityId" INTEGER,
	"title" VARCHAR(180),
	"notes" TEXT,
	"status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
	"previousCount" INTEGER,
	"currentCount" INTEGER,
	"deltaCount" INTEGER,
	"reportUrl" VARCHAR(500),
	"completedAt" TIMESTAMP(3),
	"approvedAt" TIMESTAMP(3),
	"createdByType" VARCHAR(30) NOT NULL DEFAULT 'CLIENT',
	"createdById" INTEGER,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" TIMESTAMP(3) NOT NULL,
	CONSTRAINT "inventory_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "inventory_items" (
	"id" SERIAL NOT NULL,
	"snapshotId" INTEGER NOT NULL,
	"sectionName" VARCHAR(120),
	"groupName" VARCHAR(120) NOT NULL DEFAULT 'GENERAL',
	"equipmentName" VARCHAR(180) NOT NULL,
	"serialNumber" VARCHAR(180),
	"model" VARCHAR(180),
	"panoramicPhotoUrl" VARCHAR(500),
	"closeupPhotoUrl" VARCHAR(500),
	"stickerPhotoUrl" VARCHAR(500),
	"serialBefore" VARCHAR(180),
	"serialAfter" VARCHAR(180),
	"modelBefore" VARCHAR(180),
	"modelAfter" VARCHAR(180),
	"beforePanoramicPhotoUrl" VARCHAR(500),
	"beforeCloseupPhotoUrl" VARCHAR(500),
	"afterPanoramicPhotoUrl" VARCHAR(500),
	"afterCloseupPhotoUrl" VARCHAR(500),
	"maintenanceStickerPhotoUrl" VARCHAR(500),
	"maintenanceActions" TEXT,
	"maintenanceComments" TEXT,
	"itemStatus" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
	"compareState" VARCHAR(30) NOT NULL DEFAULT 'UNCHANGED',
	"notes" TEXT,
	"sortOrder" INTEGER NOT NULL DEFAULT 0,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" TIMESTAMP(3) NOT NULL,
	CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_snapshots_requestId_key" ON "inventory_snapshots"("requestId");
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_snapshots_activityId_key" ON "inventory_snapshots"("activityId");
CREATE INDEX IF NOT EXISTS "inventory_snapshots_clientId_idx" ON "inventory_snapshots"("clientId");
CREATE INDEX IF NOT EXISTS "inventory_snapshots_branchId_idx" ON "inventory_snapshots"("branchId");
CREATE INDEX IF NOT EXISTS "inventory_snapshots_status_idx" ON "inventory_snapshots"("status");
CREATE INDEX IF NOT EXISTS "inventory_items_snapshotId_idx" ON "inventory_items"("snapshotId");
CREATE INDEX IF NOT EXISTS "inventory_items_groupName_idx" ON "inventory_items"("groupName");

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'inventory_snapshots_clientId_fkey'
	) THEN
		ALTER TABLE "inventory_snapshots"
			ADD CONSTRAINT "inventory_snapshots_clientId_fkey"
			FOREIGN KEY ("clientId") REFERENCES "service_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'inventory_snapshots_branchId_fkey'
	) THEN
		ALTER TABLE "inventory_snapshots"
			ADD CONSTRAINT "inventory_snapshots_branchId_fkey"
			FOREIGN KEY ("branchId") REFERENCES "service_client_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'inventory_snapshots_requestId_fkey'
	) THEN
		ALTER TABLE "inventory_snapshots"
			ADD CONSTRAINT "inventory_snapshots_requestId_fkey"
			FOREIGN KEY ("requestId") REFERENCES "client_ticket_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'inventory_snapshots_activityId_fkey'
	) THEN
		ALTER TABLE "inventory_snapshots"
			ADD CONSTRAINT "inventory_snapshots_activityId_fkey"
			FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_snapshotId_fkey'
	) THEN
		ALTER TABLE "inventory_items"
			ADD CONSTRAINT "inventory_items_snapshotId_fkey"
			FOREIGN KEY ("snapshotId") REFERENCES "inventory_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
	END IF;
END $$;
