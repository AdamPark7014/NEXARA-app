-- Ventanas planificadas de uso de sala (Sala de juntas) — ligero, no calendar ERP.
CREATE TABLE "integra_room_bookings" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "doorIndexCode" VARCHAR(120) NOT NULL,
    "title" VARCHAR(220) NOT NULL,
    "hostName" VARCHAR(220),
    "hostPersonId" VARCHAR(120),
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PLANNED',
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integra_room_bookings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "integra_room_bookings_siteId_startsAt_idx" ON "integra_room_bookings"("siteId", "startsAt");
CREATE INDEX "integra_room_bookings_siteId_doorIndexCode_startsAt_idx" ON "integra_room_bookings"("siteId", "doorIndexCode", "startsAt");
CREATE INDEX "integra_room_bookings_companyId_startsAt_idx" ON "integra_room_bookings"("companyId", "startsAt");
CREATE INDEX "integra_room_bookings_companyId_status_idx" ON "integra_room_bookings"("companyId", "status");

ALTER TABLE "integra_room_bookings" ADD CONSTRAINT "integra_room_bookings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integra_room_bookings" ADD CONSTRAINT "integra_room_bookings_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "integra_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
