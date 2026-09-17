-- Geocerca de actividades: salidas del radio de 100 m alrededor del punto de inicio.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACTIVITY_OUT_OF_ZONE';

CREATE TABLE "activity_geofence_alerts" (
    "id" SERIAL NOT NULL,
    "activityId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "originLatitude" DECIMAL(10,8) NOT NULL,
    "originLongitude" DECIMAL(11,8) NOT NULL,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "distanceM" INTEGER NOT NULL,
    "maxDistanceM" INTEGER NOT NULL,
    "radiusM" INTEGER NOT NULL DEFAULT 100,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ABIERTA',
    "justification" TEXT,
    "justificationPhotoUrl" VARCHAR(500),
    "justifiedAt" TIMESTAMP(3),
    CONSTRAINT "activity_geofence_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "activity_geofence_alerts_activityId_userId_idx" ON "activity_geofence_alerts"("activityId", "userId");
CREATE INDEX "activity_geofence_alerts_companyId_idx" ON "activity_geofence_alerts"("companyId");

ALTER TABLE "activity_geofence_alerts" ADD CONSTRAINT "activity_geofence_alerts_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_geofence_alerts" ADD CONSTRAINT "activity_geofence_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_geofence_alerts" ADD CONSTRAINT "activity_geofence_alerts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
