-- CreateEnum
CREATE TYPE "IntegraDeviceKind" AS ENUM ('ACS', 'ENCODE');
CREATE TYPE "IntegraSyncStatus" AS ENUM ('RUNNING', 'OK', 'ERROR');

-- CreateTable
CREATE TABLE "integra_sites" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "host" VARCHAR(500) NOT NULL,
    "appKeyEnc" TEXT NOT NULL,
    "appSecretEnc" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),
    "lastHealthOkAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integra_sites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integra_cameras" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "cameraIndexCode" VARCHAR(120) NOT NULL,
    "name" VARCHAR(220) NOT NULL,
    "regionName" VARCHAR(220),
    "regionIndexCode" VARCHAR(120),
    "status" VARCHAR(40),
    "encodeDevIndexCode" VARCHAR(120),
    "raw" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integra_cameras_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integra_doors" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "doorIndexCode" VARCHAR(120) NOT NULL,
    "name" VARCHAR(220) NOT NULL,
    "regionName" VARCHAR(220),
    "online" BOOLEAN NOT NULL DEFAULT true,
    "doorState" VARCHAR(40),
    "raw" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integra_doors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integra_people" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "personId" VARCHAR(120) NOT NULL,
    "personName" VARCHAR(220) NOT NULL,
    "personCode" VARCHAR(120),
    "orgIndexCode" VARCHAR(120),
    "orgName" VARCHAR(220),
    "raw" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integra_people_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integra_devices" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "indexCode" VARCHAR(120) NOT NULL,
    "name" VARCHAR(220) NOT NULL,
    "kind" "IntegraDeviceKind" NOT NULL,
    "ip" VARCHAR(80),
    "online" BOOLEAN NOT NULL DEFAULT true,
    "deviceType" VARCHAR(80),
    "raw" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integra_devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integra_vehicles" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "vehicleId" VARCHAR(120) NOT NULL,
    "plateNo" VARCHAR(40) NOT NULL,
    "personId" VARCHAR(120),
    "personName" VARCHAR(220),
    "raw" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integra_vehicles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integra_sync_runs" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "status" "IntegraSyncStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "cameras" INTEGER NOT NULL DEFAULT 0,
    "doors" INTEGER NOT NULL DEFAULT 0,
    "people" INTEGER NOT NULL DEFAULT 0,
    "devices" INTEGER NOT NULL DEFAULT 0,
    "vehicles" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    CONSTRAINT "integra_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "integra_sites_companyId_isActive_idx" ON "integra_sites"("companyId", "isActive");
CREATE UNIQUE INDEX "integra_sites_companyId_name_key" ON "integra_sites"("companyId", "name");
CREATE UNIQUE INDEX "integra_cameras_siteId_cameraIndexCode_key" ON "integra_cameras"("siteId", "cameraIndexCode");
CREATE INDEX "integra_cameras_companyId_idx" ON "integra_cameras"("companyId");
CREATE UNIQUE INDEX "integra_doors_siteId_doorIndexCode_key" ON "integra_doors"("siteId", "doorIndexCode");
CREATE INDEX "integra_doors_companyId_idx" ON "integra_doors"("companyId");
CREATE UNIQUE INDEX "integra_people_siteId_personId_key" ON "integra_people"("siteId", "personId");
CREATE INDEX "integra_people_companyId_idx" ON "integra_people"("companyId");
CREATE UNIQUE INDEX "integra_devices_siteId_kind_indexCode_key" ON "integra_devices"("siteId", "kind", "indexCode");
CREATE INDEX "integra_devices_companyId_idx" ON "integra_devices"("companyId");
CREATE UNIQUE INDEX "integra_vehicles_siteId_vehicleId_key" ON "integra_vehicles"("siteId", "vehicleId");
CREATE INDEX "integra_vehicles_companyId_idx" ON "integra_vehicles"("companyId");
CREATE INDEX "integra_sync_runs_companyId_startedAt_idx" ON "integra_sync_runs"("companyId", "startedAt");

ALTER TABLE "integra_sites" ADD CONSTRAINT "integra_sites_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integra_cameras" ADD CONSTRAINT "integra_cameras_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integra_cameras" ADD CONSTRAINT "integra_cameras_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "integra_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integra_doors" ADD CONSTRAINT "integra_doors_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integra_doors" ADD CONSTRAINT "integra_doors_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "integra_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integra_people" ADD CONSTRAINT "integra_people_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integra_people" ADD CONSTRAINT "integra_people_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "integra_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integra_devices" ADD CONSTRAINT "integra_devices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integra_devices" ADD CONSTRAINT "integra_devices_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "integra_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integra_vehicles" ADD CONSTRAINT "integra_vehicles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integra_vehicles" ADD CONSTRAINT "integra_vehicles_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "integra_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integra_sync_runs" ADD CONSTRAINT "integra_sync_runs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integra_sync_runs" ADD CONSTRAINT "integra_sync_runs_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "integra_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
