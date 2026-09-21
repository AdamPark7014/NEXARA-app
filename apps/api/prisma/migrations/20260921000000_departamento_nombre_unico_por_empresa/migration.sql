-- El nombre de departamento era único GLOBAL, no por empresa.
--
-- El esquema Prisma declara `@@unique([companyId, nombre])` desde que el sistema
-- es multiempresa, pero el índice viejo `Department_nombre_key` —de cuando había
-- una sola empresa— nunca se eliminó. La base lo seguía aplicando, así que dos
-- empresas no podían tener ambas un departamento llamado «Operaciones»,
-- «Administración» o «Ingeniería».
--
-- Salió al sembrar el tenant de demostración del revisor de Play: Postgres
-- rechazó el alta con «Unique constraint failed on the fields: (nombre)» aunque
-- el código usaba correctamente la clave compuesta. No era un fallo del
-- sembrado: era la primera vez que dos empresas intentaban el mismo nombre.
--
-- Quitar un índice único nunca falla por los datos existentes, y la unicidad
-- dentro de cada empresa la sigue garantizando `Department_companyId_nombre_key`.
--
-- La tabla real del modelo Prisma `Department` es "Department" (no tiene @@map).

DROP INDEX IF EXISTS "Department_nombre_key";
