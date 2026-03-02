-- CreateEnum
CREATE TYPE "ToolInventoryStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'IN_REPAIR', 'RETIRED');

-- CreateEnum
CREATE TYPE "ToolAssignmentType" AS ENUM ('KIT', 'LOAN');

-- CreateEnum
CREATE TYPE "ToolKitEventResolution" AS ENUM ('PENDING', 'USER_MISUSE', 'EQUIPMENT_FAILURE');

-- AlterTable
ALTER TABLE "tool_requests" ADD COLUMN "inventoryItemId" INTEGER;

-- CreateTable
CREATE TABLE "tool_inventory_items" (
    "id" SERIAL NOT NULL,
    "toolName" VARCHAR(200) NOT NULL,
    "model" VARCHAR(200) NOT NULL,
    "serialNumber" VARCHAR(200) NOT NULL,
    "panoramicPhotoUrl" VARCHAR(500) NOT NULL,
    "serialPhotoUrl" VARCHAR(500) NOT NULL,
    "status" "ToolInventoryStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "replacementOfId" INTEGER,
    "retiredReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tool_inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_kit_assignments" (
    "id" SERIAL NOT NULL,
    "inventoryItemId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "assignmentType" "ToolAssignmentType" NOT NULL DEFAULT 'KIT',
    "assignedById" INTEGER,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueReturnDate" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "replacementCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tool_kit_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_kit_events" (
    "id" SERIAL NOT NULL,
    "assignmentId" INTEGER NOT NULL,
    "reportedById" INTEGER NOT NULL,
    "resolvedById" INTEGER,
    "fineId" INTEGER,
    "replacementItemId" INTEGER,
    "description" TEXT NOT NULL,
    "resolution" "ToolKitEventResolution" NOT NULL DEFAULT 'PENDING',
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tool_kit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tool_inventory_items_serialNumber_key" ON "tool_inventory_items"("serialNumber");
CREATE INDEX "tool_inventory_items_status_idx" ON "tool_inventory_items"("status");
CREATE INDEX "tool_inventory_items_toolName_model_idx" ON "tool_inventory_items"("toolName", "model");
CREATE INDEX "tool_inventory_items_replacementOfId_idx" ON "tool_inventory_items"("replacementOfId");
CREATE INDEX "tool_kit_assignments_userId_isActive_idx" ON "tool_kit_assignments"("userId", "isActive");
CREATE INDEX "tool_kit_assignments_inventoryItemId_isActive_idx" ON "tool_kit_assignments"("inventoryItemId", "isActive");
CREATE INDEX "tool_kit_events_assignmentId_reportedAt_idx" ON "tool_kit_events"("assignmentId", "reportedAt");
CREATE INDEX "tool_kit_events_resolution_idx" ON "tool_kit_events"("resolution");
CREATE INDEX "tool_requests_inventoryItemId_idx" ON "tool_requests"("inventoryItemId");

-- AddForeignKey
ALTER TABLE "tool_requests"
  ADD CONSTRAINT "tool_requests_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "tool_inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tool_inventory_items"
  ADD CONSTRAINT "tool_inventory_items_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tool_inventory_items"
  ADD CONSTRAINT "tool_inventory_items_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tool_inventory_items"
  ADD CONSTRAINT "tool_inventory_items_replacementOfId_fkey"
  FOREIGN KEY ("replacementOfId") REFERENCES "tool_inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tool_kit_assignments"
  ADD CONSTRAINT "tool_kit_assignments_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "tool_inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tool_kit_assignments"
  ADD CONSTRAINT "tool_kit_assignments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tool_kit_assignments"
  ADD CONSTRAINT "tool_kit_assignments_assignedById_fkey"
  FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tool_kit_events"
  ADD CONSTRAINT "tool_kit_events_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "tool_kit_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tool_kit_events"
  ADD CONSTRAINT "tool_kit_events_reportedById_fkey"
  FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tool_kit_events"
  ADD CONSTRAINT "tool_kit_events_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tool_kit_events"
  ADD CONSTRAINT "tool_kit_events_replacementItemId_fkey"
  FOREIGN KEY ("replacementItemId") REFERENCES "tool_inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
