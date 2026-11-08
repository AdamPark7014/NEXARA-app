-- El índice único global por nombre de 20260316200000 nunca se quitó cuando 20260725220000 lo pasó a
-- (companyId, name). Con él, la siembra de flujos de cada empresa nueva choca con la de la empresa 1
-- («Unique constraint failed on the fields: (name)» en cada arranque de la API, 07-11).
DROP INDEX IF EXISTS "workflow_definitions_name_key";
