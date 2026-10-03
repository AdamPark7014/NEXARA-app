-- Un solo padrón de clientes, y cada cliente puede ser de proyecto, corporativo y comercial
-- a la vez.
--
-- No cambia el esquema. La membresía ya vive en "sales_client_sectors"; la migración
-- 20260928220000_sales_client_tipo la había dejado en una sola fila por cliente (la de su
-- "tipo") y borró las demás. Aquí solo se completan datos: nada se borra ni se pisa, y
-- correrla dos veces no duplica (cada INSERT lleva su NOT EXISTS).
--
-- "sales_clients"."tipo" se conserva como el tipo principal (con el que nació el cliente).
-- Las listas y los selectores leen la membresía.

-- 1. Clientes de operación que ya tienen proyectos o actividades pero no tienen ficha en el
--    padrón (altas viejas, antes de que el alta rápida escribiera en "sales_clients"):
--    se les crea una ficha mínima para que se puedan ver y completar en Clientes.
--    De proyecto si tienen un proyecto; si solo tienen actividades, corporativo.
INSERT INTO "sales_clients" (
  "name", "billingEmail", "billingPhone", "fiscalAddress", "status",
  "serviceClientId", "companyId", "tipo", "createdAt", "updatedAt"
)
SELECT
  svc."name",
  svc."contactEmail",
  svc."contactPhone",
  svc."address",
  CASE WHEN svc."isActive" THEN 'Activo' ELSE 'Inactivo' END,
  svc."id",
  svc."companyId",
  CASE
    WHEN EXISTS (
      SELECT 1 FROM "operational_projects" p
      WHERE p."clientId" = svc."id" AND p."deletedAt" IS NULL
    ) THEN 'PROYECTO'::"ClientSector"
    ELSE 'CORPORATIVO'::"ClientSector"
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "service_clients" svc
WHERE NOT EXISTS (
    SELECT 1 FROM "sales_clients" sc WHERE sc."serviceClientId" = svc."id"
  )
  AND (
    EXISTS (
      SELECT 1 FROM "operational_projects" p
      WHERE p."clientId" = svc."id" AND p."deletedAt" IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM "Activity" a
      WHERE a."clientId" = svc."id" AND a."deletedAt" IS NULL
    )
  );

-- 2. Todo cliente tiene la fila de membresía de su tipo principal (las altas automáticas
--    desde operación guardaban el tipo sin su fila).
INSERT INTO "sales_client_sectors" ("salesClientId", "sector", "companyId", "createdAt")
SELECT sc."id", sc."tipo", sc."companyId", CURRENT_TIMESTAMP
FROM "sales_clients" sc
WHERE NOT EXISTS (
  SELECT 1 FROM "sales_client_sectors" s
  WHERE s."salesClientId" = sc."id" AND s."sector" = sc."tipo"
);

-- 3. Los demás tipos se recuperan por el uso real, con las mismas reglas con las que
--    20260928220000 eligió uno solo; ahora se suman todos los que apliquen.

--    Tiene proyectos → también es cliente de proyecto.
INSERT INTO "sales_client_sectors" ("salesClientId", "sector", "companyId", "createdAt")
SELECT sc."id", 'PROYECTO'::"ClientSector", sc."companyId", CURRENT_TIMESTAMP
FROM "sales_clients" sc
WHERE sc."serviceClientId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "operational_projects" p
    WHERE p."clientId" = sc."serviceClientId" AND p."deletedAt" IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM "sales_client_sectors" s
    WHERE s."salesClientId" = sc."id" AND s."sector" = 'PROYECTO'::"ClientSector"
  );

--    Tiene actividades de servicio → también es corporativo.
INSERT INTO "sales_client_sectors" ("salesClientId", "sector", "companyId", "createdAt")
SELECT sc."id", 'CORPORATIVO'::"ClientSector", sc."companyId", CURRENT_TIMESTAMP
FROM "sales_clients" sc
WHERE sc."serviceClientId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "Activity" a
    WHERE a."clientId" = sc."serviceClientId"
      AND a."deletedAt" IS NULL
      AND (
        lower(coalesce(a."coreKind", '')) = 'servicio'
        OR (a."coreKind" IS NULL AND a."projectId" IS NULL)
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM "sales_client_sectors" s
    WHERE s."salesClientId" = sc."id" AND s."sector" = 'CORPORATIVO'::"ClientSector"
  );

--    Tiene cotizaciones → también es comercial.
INSERT INTO "sales_client_sectors" ("salesClientId", "sector", "companyId", "createdAt")
SELECT sc."id", 'COMERCIAL'::"ClientSector", sc."companyId", CURRENT_TIMESTAMP
FROM "sales_clients" sc
WHERE EXISTS (
    SELECT 1 FROM "cotizaciones" c
    WHERE c."salesClientId" = sc."id" AND c."deletedAt" IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM "sales_client_sectors" s
    WHERE s."salesClientId" = sc."id" AND s."sector" = 'COMERCIAL'::"ClientSector"
  );

-- 4. Todo cliente del padrón queda ligado a su cliente de operación, también el comercial.
--    Las actividades y los proyectos se ligan a "service_clients"; el selector de una
--    actividad comercial solo ofrece clientes que ya tienen ese vínculo, así que el cliente
--    dado de alta en una cotización no se podía elegir ahí. Mismos datos que escribe
--    `vincularClienteDeOperacion` (ventas.service.ts) al dar de alta uno nuevo.
DO $$
DECLARE
  cliente RECORD;
  operacion_id INTEGER;
BEGIN
  FOR cliente IN
    SELECT "id", "name", "legalName", "taxId", "billingEmail", "billingPhone", "fiscalAddress", "companyId"
    FROM "sales_clients"
    WHERE "serviceClientId" IS NULL
    ORDER BY "id"
  LOOP
    INSERT INTO "service_clients" (
      "name", "contactName", "contactEmail", "contactPhone", "address",
      "accountCode", "isActive", "companyId", "createdAt", "updatedAt"
    )
    VALUES (
      LEFT(COALESCE(NULLIF(BTRIM(cliente."legalName"), ''), cliente."name"), 200),
      LEFT(cliente."name", 160),
      cliente."billingEmail",
      cliente."billingPhone",
      LEFT(cliente."fiscalAddress", 220),
      LEFT(COALESCE(NULLIF(BTRIM(cliente."taxId"), ''), 'SC-' || cliente."id"), 80),
      true,
      cliente."companyId",
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    RETURNING "id" INTO operacion_id;

    UPDATE "sales_clients" SET "serviceClientId" = operacion_id WHERE "id" = cliente."id";
  END LOOP;
END $$;
