-- El tipo de cambio del día para el aviso de «hoy en CT»: sin esto ordena 7,870 filas en cada búsqueda
-- (37-98 ms contra 0.07, medido en producción). Prisma no sabe declarar un índice parcial: vive solo aquí.
CREATE INDEX IF NOT EXISTS "productos_ct_usd_reciente_idx" ON "productos_ct" ("updatedAt" DESC) WHERE activo AND upper(moneda) = 'USD';
