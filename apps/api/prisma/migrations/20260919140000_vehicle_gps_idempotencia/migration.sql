-- Ingesta de GPS idempotente.
--
-- Un rastreador no puede estar en dos sitios en el mismo instante: (vehículo,
-- hora del punto) es la llave natural de una posición. Con este índice, una
-- reentrega del proveedor —la cola de Hik-Connect for Teams vuelve a servir un
-- lote cuando no se acusa su `batchId`— no duplica el recorrido del día.
--
-- Aditiva: no borra ni cambia columnas. Primero se limpian los duplicados que
-- pudieran existir de antes, conservando el punto más antiguo de cada llave.

DELETE FROM "vehicle_positions" a
USING "vehicle_positions" b
WHERE a."vehicleAssetId" = b."vehicleAssetId"
  AND a."at" = b."at"
  AND a."id" > b."id";

CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_positions_vehicleAssetId_at_key"
  ON "vehicle_positions" ("vehicleAssetId", "at");
