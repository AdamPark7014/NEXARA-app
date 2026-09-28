-- Un cliente, un tipo. COMERCIAL vive en cotizaciones, PROYECTO en proyectos,
-- CORPORATIVO en actividades de servicio.
--
-- Clasificación de los que ya existían (misma regla que `tipoPorUso` en
-- apps/api/src/ventas/client-tipo.ts):
--   * cotización ligada (salesClientId) → COMERCIAL, fecha = updatedAt más reciente
--   * proyecto operativo del cliente de operación (serviceClientId) → PROYECTO
--   * actividad de servicio de ese cliente de operación → CORPORATIVO
--     (coreKind = servicio, o actividad con cliente y sin proyecto si no traía tipo)
--   * si dos usos empatan en la fecha más reciente, o no hay ninguno → COMERCIAL
-- Después se deja una sola fila en sales_client_sectors, la del tipo elegido.

ALTER TABLE "sales_clients" ADD COLUMN "tipo" "ClientSector" NOT NULL DEFAULT 'COMERCIAL';

CREATE INDEX "sales_clients_companyId_tipo_idx" ON "sales_clients"("companyId", "tipo");

WITH usos AS (
  SELECT
    sc.id,
    (
      SELECT MAX(c."updatedAt")
      FROM "cotizaciones" c
      WHERE c."salesClientId" = sc.id
        AND c."deletedAt" IS NULL
    ) AS comercial_at,
    (
      SELECT MAX(p."updatedAt")
      FROM "operational_projects" p
      WHERE sc."serviceClientId" IS NOT NULL
        AND p."clientId" = sc."serviceClientId"
        AND p."deletedAt" IS NULL
    ) AS proyecto_at,
    (
      SELECT MAX(a."fechaAsignacion")
      FROM "Activity" a
      WHERE sc."serviceClientId" IS NOT NULL
        AND a."clientId" = sc."serviceClientId"
        AND a."deletedAt" IS NULL
        AND (
          lower(coalesce(a."coreKind", '')) = 'servicio'
          OR (a."coreKind" IS NULL AND a."projectId" IS NULL)
        )
    ) AS corporativo_at
  FROM "sales_clients" sc
),
marcado AS (
  SELECT
    id,
    comercial_at,
    proyecto_at,
    corporativo_at,
    GREATEST(
      COALESCE(comercial_at, '-infinity'::timestamp),
      COALESCE(proyecto_at, '-infinity'::timestamp),
      COALESCE(corporativo_at, '-infinity'::timestamp)
    ) AS mejor
  FROM usos
)
UPDATE "sales_clients" sc
SET "tipo" = CASE
  WHEN m.comercial_at IS NULL AND m.proyecto_at IS NULL AND m.corporativo_at IS NULL THEN 'COMERCIAL'::"ClientSector"
  WHEN (
    (CASE WHEN m.comercial_at = m.mejor THEN 1 ELSE 0 END)
    + (CASE WHEN m.proyecto_at = m.mejor THEN 1 ELSE 0 END)
    + (CASE WHEN m.corporativo_at = m.mejor THEN 1 ELSE 0 END)
  ) > 1 THEN 'COMERCIAL'::"ClientSector"
  WHEN m.comercial_at = m.mejor THEN 'COMERCIAL'::"ClientSector"
  WHEN m.proyecto_at = m.mejor THEN 'PROYECTO'::"ClientSector"
  ELSE 'CORPORATIVO'::"ClientSector"
END
FROM marcado m
WHERE sc.id = m.id;

DELETE FROM "sales_client_sectors" s
USING "sales_clients" sc
WHERE s."salesClientId" = sc.id
  AND s.sector::text <> sc.tipo::text;

INSERT INTO "sales_client_sectors" ("salesClientId", "sector", "companyId", "createdAt")
SELECT sc.id, sc.tipo, sc."companyId", CURRENT_TIMESTAMP
FROM "sales_clients" sc
WHERE NOT EXISTS (
  SELECT 1
  FROM "sales_client_sectors" s
  WHERE s."salesClientId" = sc.id
    AND s.sector = sc.tipo
);
