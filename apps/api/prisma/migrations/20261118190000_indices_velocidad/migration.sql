-- Programa Velocidad (18-11-2026): índices para las consultas más frecuentes.
CREATE INDEX IF NOT EXISTS "LocationTracking_usuarioId_ultimaActualizacion_idx" ON "LocationTracking"("usuarioId", "ultimaActualizacion");
CREATE INDEX IF NOT EXISTS "Activity_companyId_responsableId_estatus_idx" ON "Activity"("companyId", "responsableId", "estatus");
CREATE INDEX IF NOT EXISTS "Activity_estatus_fechaEntregaEsperada_idx" ON "Activity"("estatus", "fechaEntregaEsperada");
CREATE INDEX IF NOT EXISTS "Activity_companyId_fechaAsignacion_idx" ON "Activity"("companyId", "fechaAsignacion");
