-- Trayecto de una actividad (29-10-2026): tramos de ida y de regreso, medidos aparte del reloj.
CREATE TABLE "activity_trayectos" (
    "id" SERIAL NOT NULL,
    "activityId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "tipo" VARCHAR(10) NOT NULL,
    "modo" VARCHAR(12) NOT NULL DEFAULT 'AUTO',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "finMotivo" VARCHAR(12),
    "startLat" DECIMAL(10,8),
    "startLng" DECIMAL(11,8),
    "endLat" DECIMAL(10,8),
    "endLng" DECIMAL(11,8),
    "estimadoMin" INTEGER,
    "estimadoFuente" VARCHAR(12),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_trayectos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "activity_trayectos_activityId_idx" ON "activity_trayectos"("activityId");
CREATE INDEX "activity_trayectos_userId_endedAt_idx" ON "activity_trayectos"("userId", "endedAt");
CREATE INDEX "activity_trayectos_companyId_idx" ON "activity_trayectos"("companyId");

ALTER TABLE "activity_trayectos" ADD CONSTRAINT "activity_trayectos_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
