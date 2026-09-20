-- Base de datos para cuatro frentes de trabajo que arrancan a la vez (WS0).
--
--   A. Asistencia confiable y nómina: desde dónde se checó (Android/iOS/web), los intentos
--      de checada que el servidor rechazó (ubicación simulada, sin GPS) y la aprobación de
--      horas extra por día antes de que lleguen a nómina.
--   B. Checklist de herramientas en la OT: qué hay que llevar a cada actividad, quién lo
--      palomeó, y préstamos de herramienta ligados a la OT con código de recogida.
--   C. Almacén, herramientas, reabastecimiento, empaque y kits: parámetros para calcular
--      mínimos/máximos, presentaciones de compra («Caja» = 100 piezas) con la conversión
--      guardada en cada movimiento y partida de compra, e inspecciones periódicas de kits.
--   D. Vehículos: rastreador GPS por unidad con su historial de puntos, y foto del tablero
--      (odómetro y combustible) más metadatos de cada foto al salir y al devolver.
--
-- Todo es aditivo: columnas nullable o con default, tablas nuevas, ningún DROP ni RENAME
-- y ningún UPDATE/INSERT/DELETE. Las filas que ya existen no cambian de significado.
-- Idempotente (IF NOT EXISTS en todo) para poder correrla dos veces sin romper nada.
--
-- Los nombres de índices y llaves foráneas son exactamente los que genera Prisma
-- (`prisma migrate diff`), para que la base y el schema no se desfasen.

-- ---------------------------------------------------------------------------
-- 1. Tipos nuevos.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OvertimeApprovalEstado') THEN
    CREATE TYPE "OvertimeApprovalEstado" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ToolKitInspectionEstado') THEN
    CREATE TYPE "ToolKitInspectionEstado" AS ENUM ('OK', 'OBSERVADO', 'DANADO');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Asistencia confiable y nómina.
-- ---------------------------------------------------------------------------

-- 2a. Origen de la checada. NULL = registros de antes de guardarlo (no se inventa).
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "origen" VARCHAR(10);

-- 2b. Punto de GPS marcado como ubicación simulada por el teléfono.
--     NULL = punto viejo o cliente que todavía no lo informa (no es lo mismo que «false»).
ALTER TABLE "LocationTracking" ADD COLUMN IF NOT EXISTS "mockLocation" BOOLEAN;

-- 2c. Intentos de checada rechazados. No van a "Attendance" porque de ahí sale la nómina,
--     pero RH necesita verlos: quién intentó, desde dónde y por qué no pasó.
CREATE TABLE IF NOT EXISTS "attendance_rejections" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "type" VARCHAR(10) NOT NULL,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "accuracyM" DOUBLE PRECISION,
  "motivo" VARCHAR(40) NOT NULL,
  "detalle" TEXT,
  "origen" VARCHAR(10),
  "deviceInfo" TEXT,
  "clientCapturedAt" TIMESTAMP(3),
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "companyId" INTEGER NOT NULL,
  CONSTRAINT "attendance_rejections_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "attendance_rejections_companyId_idx" ON "attendance_rejections"("companyId");
CREATE INDEX IF NOT EXISTS "attendance_rejections_userId_at_idx" ON "attendance_rejections"("userId", "at");
CREATE INDEX IF NOT EXISTS "attendance_rejections_motivo_at_idx" ON "attendance_rejections"("motivo", "at");

-- 2d. Horas extra por persona y día, con su aprobación. Una fila por persona y día
--     (índice único), para que un doble envío no duplique minutos en la nómina.
CREATE TABLE IF NOT EXISTS "overtime_approvals" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "fecha" DATE NOT NULL,
  "minutos" INTEGER NOT NULL,
  "estado" "OvertimeApprovalEstado" NOT NULL DEFAULT 'PENDIENTE',
  "aprobadoPorId" INTEGER,
  "nota" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "companyId" INTEGER NOT NULL,
  CONSTRAINT "overtime_approvals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "overtime_approvals_userId_fecha_key" ON "overtime_approvals"("userId", "fecha");
CREATE INDEX IF NOT EXISTS "overtime_approvals_estado_fecha_idx" ON "overtime_approvals"("estado", "fecha");
CREATE INDEX IF NOT EXISTS "overtime_approvals_companyId_idx" ON "overtime_approvals"("companyId");

-- ---------------------------------------------------------------------------
-- 3. Checklist de herramientas en la OT.
-- ---------------------------------------------------------------------------

-- 3a. Préstamo de herramienta ligado a la OT, con código de recogida en almacén.
--     Los préstamos que ya existen quedan sin OT y sin código (NULL): siguen igual.
ALTER TABLE "tool_requests" ADD COLUMN IF NOT EXISTS "activityId" INTEGER;
ALTER TABLE "tool_requests" ADD COLUMN IF NOT EXISTS "pickupCode" VARCHAR(20);
ALTER TABLE "tool_requests" ADD COLUMN IF NOT EXISTS "pickupExpiresAt" TIMESTAMP(3);
ALTER TABLE "tool_requests" ADD COLUMN IF NOT EXISTS "pickedUpAt" TIMESTAMP(3);
ALTER TABLE "tool_requests" ADD COLUMN IF NOT EXISTS "pickedUpById" INTEGER;

CREATE INDEX IF NOT EXISTS "tool_requests_activityId_idx" ON "tool_requests"("activityId");
CREATE INDEX IF NOT EXISTS "tool_requests_pickupCode_idx" ON "tool_requests"("pickupCode");

-- 3b. Renglones del checklist: qué hay que llevar a la OT (producto del catálogo,
--     herramienta concreta del inventario, o solo la descripción).
CREATE TABLE IF NOT EXISTS "activity_tool_requirements" (
  "id" SERIAL NOT NULL,
  "activityId" INTEGER NOT NULL,
  "productId" INTEGER,
  "toolId" INTEGER,
  "descripcion" VARCHAR(300) NOT NULL,
  "cantidad" DECIMAL(14,4) NOT NULL DEFAULT 1,
  "companyId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "activity_tool_requirements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "activity_tool_requirements_activityId_idx" ON "activity_tool_requirements"("activityId");
CREATE INDEX IF NOT EXISTS "activity_tool_requirements_companyId_idx" ON "activity_tool_requirements"("companyId");

-- 3c. Palomeo de cada renglón: quién, cuándo, si está bien y con qué foto.
--     Se guardan todos los palomeos (no solo el último) para poder auditar.
CREATE TABLE IF NOT EXISTS "activity_tool_checks" (
  "id" SERIAL NOT NULL,
  "requirementId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "ok" BOOLEAN NOT NULL,
  "nota" TEXT,
  "fotoUrl" VARCHAR(500),
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "companyId" INTEGER NOT NULL,
  CONSTRAINT "activity_tool_checks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "activity_tool_checks_requirementId_idx" ON "activity_tool_checks"("requirementId");
CREATE INDEX IF NOT EXISTS "activity_tool_checks_userId_at_idx" ON "activity_tool_checks"("userId", "at");
CREATE INDEX IF NOT EXISTS "activity_tool_checks_companyId_idx" ON "activity_tool_checks"("companyId");

-- ---------------------------------------------------------------------------
-- 4. Almacén: reabastecimiento, empaque y kits.
-- ---------------------------------------------------------------------------

-- 4a. Parámetros de reabastecimiento del producto. `esCirculante` nace en false para
--     todo el catálogo: nadie entra al cálculo automático hasta que alguien lo marque.
--     (Agregar una columna con default constante no reescribe la tabla en Postgres 11+.)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "esCirculante" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "leadTimeDias" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "compraMinima" DECIMAL(14,4);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "stockSeguridadDias" INTEGER;

-- 4b. Mínimo/máximo calculados, aparte de `minStock`/`maxStock` (los capturados a mano),
--     para que el cálculo nunca pise lo que alguien fijó.
ALTER TABLE "stock_levels" ADD COLUMN IF NOT EXISTS "minCalculado" DECIMAL(14,4);
ALTER TABLE "stock_levels" ADD COLUMN IF NOT EXISTS "maxCalculado" DECIMAL(14,4);
ALTER TABLE "stock_levels" ADD COLUMN IF NOT EXISTS "calculadoAt" TIMESTAMP(3);

-- 4c. Presentaciones de compra/captura. El inventario sigue en unidad base.
CREATE TABLE IF NOT EXISTS "product_packagings" (
  "id" SERIAL NOT NULL,
  "productId" INTEGER NOT NULL,
  "nombre" VARCHAR(60) NOT NULL,
  "piezasPorUnidad" DECIMAL(14,4) NOT NULL,
  "codigoBarras" VARCHAR(64),
  "esDefaultCompra" BOOLEAN NOT NULL DEFAULT false,
  "companyId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_packagings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "product_packagings_productId_nombre_key" ON "product_packagings"("productId", "nombre");
CREATE INDEX IF NOT EXISTS "product_packagings_codigoBarras_idx" ON "product_packagings"("codigoBarras");
CREATE INDEX IF NOT EXISTS "product_packagings_companyId_idx" ON "product_packagings"("companyId");

-- 4d. Conversión guardada en cada movimiento y partida de compra: cómo se capturó
--     («Caja»), el factor de ese momento y lo tecleado. `quantity` sigue en unidad base;
--     guardar el factor evita que cambiar la presentación mañana reescriba el pasado.
--     NULL = capturado directo en unidad base (todo lo que ya existe).
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "unidadCaptura" VARCHAR(60);
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "factorConversion" DECIMAL(14,4);
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "cantidadCapturada" DECIMAL(14,4);

ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "unidadCaptura" VARCHAR(60);
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "factorConversion" DECIMAL(14,4);
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "cantidadCapturada" DECIMAL(14,4);

-- 4e. Kits: inspección periódica. Los kits ya asignados quedan sin periodicidad (NULL)
--     hasta que alguien la fije; no se programa ninguna inspección desde aquí.
ALTER TABLE "tool_kit_assignments" ADD COLUMN IF NOT EXISTS "inspeccionCadaDias" INTEGER;
ALTER TABLE "tool_kit_assignments" ADD COLUMN IF NOT EXISTS "proximaInspeccion" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "tool_kit_assignments_proximaInspeccion_idx" ON "tool_kit_assignments"("proximaInspeccion");

CREATE TABLE IF NOT EXISTS "tool_kit_inspections" (
  "id" SERIAL NOT NULL,
  "assignmentId" INTEGER NOT NULL,
  "inspectorId" INTEGER NOT NULL,
  "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "estado" "ToolKitInspectionEstado" NOT NULL DEFAULT 'OK',
  "notas" TEXT,
  "fotos" JSONB,
  "companyId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tool_kit_inspections_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "tool_kit_inspections_assignmentId_fecha_idx" ON "tool_kit_inspections"("assignmentId", "fecha");
CREATE INDEX IF NOT EXISTS "tool_kit_inspections_companyId_idx" ON "tool_kit_inspections"("companyId");

-- ---------------------------------------------------------------------------
-- 5. Vehículos.
-- ---------------------------------------------------------------------------

-- 5a. Rastreador GPS de la unidad (proveedor externo y el id del equipo allá).
--     NULL = la unidad no tiene rastreador.
ALTER TABLE "VehicleAsset" ADD COLUMN IF NOT EXISTS "gpsProveedor" VARCHAR(40);
ALTER TABLE "VehicleAsset" ADD COLUMN IF NOT EXISTS "gpsDispositivoId" VARCHAR(80);

-- 5b. Foto del tablero al salir y al devolver: respalda los números de odómetro y
--     combustible que ya se capturan. `fotosMeta` guarda por foto { slot, url,
--     capturedAt, lat, lng } sin tocar `fotosSalida`/`fotosDevolucion`.
ALTER TABLE "VehicleControl" ADD COLUMN IF NOT EXISTS "fotosMeta" JSONB;
ALTER TABLE "VehicleControl" ADD COLUMN IF NOT EXISTS "fotoTableroSalidaUrl" VARCHAR(500);
ALTER TABLE "VehicleControl" ADD COLUMN IF NOT EXISTS "fotoTableroDevolucionUrl" VARCHAR(500);

-- 5c. Puntos del rastreador. Misma precisión de coordenadas que "LocationTracking".
--     `at` es la hora del GPS; `createdAt`, la de llegada al servidor.
CREATE TABLE IF NOT EXISTS "vehicle_positions" (
  "id" SERIAL NOT NULL,
  "vehicleAssetId" INTEGER NOT NULL,
  "lat" DECIMAL(10,8) NOT NULL,
  "lng" DECIMAL(11,8) NOT NULL,
  "velocidadKmh" DECIMAL(6,2),
  "rumbo" DECIMAL(5,2),
  "at" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "companyId" INTEGER NOT NULL,
  CONSTRAINT "vehicle_positions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "vehicle_positions_vehicleAssetId_at_idx" ON "vehicle_positions"("vehicleAssetId", "at");
CREATE INDEX IF NOT EXISTS "vehicle_positions_companyId_idx" ON "vehicle_positions"("companyId");

-- ---------------------------------------------------------------------------
-- 6. Llaves foráneas.
--    Tablas nuevas: todo lo de la empresa es RESTRICT (no se borra una empresa con
--    datos); lo que cuelga de su padre se va con él (CASCADE); quien aprobó/recogió
--    queda en NULL si se borra su usuario (SET NULL).
--    Columnas nuevas en "tool_requests": SET NULL, para que borrar una OT o un usuario
--    no se lleve el historial de préstamos.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Asistencia y horas extra
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_rejections_userId_fkey') THEN
    ALTER TABLE "attendance_rejections" ADD CONSTRAINT "attendance_rejections_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_rejections_companyId_fkey') THEN
    ALTER TABLE "attendance_rejections" ADD CONSTRAINT "attendance_rejections_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'overtime_approvals_userId_fkey') THEN
    ALTER TABLE "overtime_approvals" ADD CONSTRAINT "overtime_approvals_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'overtime_approvals_aprobadoPorId_fkey') THEN
    ALTER TABLE "overtime_approvals" ADD CONSTRAINT "overtime_approvals_aprobadoPorId_fkey"
      FOREIGN KEY ("aprobadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'overtime_approvals_companyId_fkey') THEN
    ALTER TABLE "overtime_approvals" ADD CONSTRAINT "overtime_approvals_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- Préstamos ligados a la OT
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tool_requests_activityId_fkey') THEN
    ALTER TABLE "tool_requests" ADD CONSTRAINT "tool_requests_activityId_fkey"
      FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tool_requests_pickedUpById_fkey') THEN
    ALTER TABLE "tool_requests" ADD CONSTRAINT "tool_requests_pickedUpById_fkey"
      FOREIGN KEY ("pickedUpById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  -- Checklist de la OT
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_tool_requirements_activityId_fkey') THEN
    ALTER TABLE "activity_tool_requirements" ADD CONSTRAINT "activity_tool_requirements_activityId_fkey"
      FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_tool_requirements_productId_fkey') THEN
    ALTER TABLE "activity_tool_requirements" ADD CONSTRAINT "activity_tool_requirements_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_tool_requirements_toolId_fkey') THEN
    ALTER TABLE "activity_tool_requirements" ADD CONSTRAINT "activity_tool_requirements_toolId_fkey"
      FOREIGN KEY ("toolId") REFERENCES "tool_inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_tool_requirements_companyId_fkey') THEN
    ALTER TABLE "activity_tool_requirements" ADD CONSTRAINT "activity_tool_requirements_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_tool_checks_requirementId_fkey') THEN
    ALTER TABLE "activity_tool_checks" ADD CONSTRAINT "activity_tool_checks_requirementId_fkey"
      FOREIGN KEY ("requirementId") REFERENCES "activity_tool_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_tool_checks_userId_fkey') THEN
    ALTER TABLE "activity_tool_checks" ADD CONSTRAINT "activity_tool_checks_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_tool_checks_companyId_fkey') THEN
    ALTER TABLE "activity_tool_checks" ADD CONSTRAINT "activity_tool_checks_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- Empaque
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_packagings_productId_fkey') THEN
    ALTER TABLE "product_packagings" ADD CONSTRAINT "product_packagings_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_packagings_companyId_fkey') THEN
    ALTER TABLE "product_packagings" ADD CONSTRAINT "product_packagings_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- Inspección de kits
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tool_kit_inspections_assignmentId_fkey') THEN
    ALTER TABLE "tool_kit_inspections" ADD CONSTRAINT "tool_kit_inspections_assignmentId_fkey"
      FOREIGN KEY ("assignmentId") REFERENCES "tool_kit_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tool_kit_inspections_inspectorId_fkey') THEN
    ALTER TABLE "tool_kit_inspections" ADD CONSTRAINT "tool_kit_inspections_inspectorId_fkey"
      FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tool_kit_inspections_companyId_fkey') THEN
    ALTER TABLE "tool_kit_inspections" ADD CONSTRAINT "tool_kit_inspections_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- Posiciones de vehículos
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_positions_vehicleAssetId_fkey') THEN
    ALTER TABLE "vehicle_positions" ADD CONSTRAINT "vehicle_positions_vehicleAssetId_fkey"
      FOREIGN KEY ("vehicleAssetId") REFERENCES "VehicleAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_positions_companyId_fkey') THEN
    ALTER TABLE "vehicle_positions" ADD CONSTRAINT "vehicle_positions_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;
