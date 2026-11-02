-- Modelo sin guiones ni espacios: lo usan el buscador y el aviso de «hoy en CT». Sin esto cada búsqueda
-- recorre el catálogo completo (50-60 ms contra menos de 3, medido con 14,877 filas).
-- Prisma no sabe declarar índices sobre una expresión: viven solo aquí.
CREATE INDEX IF NOT EXISTS "productos_ct_modelo_norm_idx" ON "productos_ct" ((regexp_replace(upper(coalesce("modelo", '')), '[^A-Z0-9]', '', 'g')));
CREATE INDEX IF NOT EXISTS "productos_ct_parte_norm_idx" ON "productos_ct" ((regexp_replace(upper(coalesce("numParte", '')), '[^A-Z0-9]', '', 'g')));
CREATE INDEX IF NOT EXISTS "productos_ct_clave_upper_idx" ON "productos_ct" ((upper("clave")));
