-- Proyectos profesionales: fechas plan vs real, cronograma, alcance, requerimientos,
-- equipo con papel, presupuesto y documentos.
--
-- Todo es aditivo. Los proyectos que ya existen siguen siendo válidos: conservan su
-- `status` actual (ACTIVE/ON_HOLD/COMPLETED), sus fechas planeadas y sus ingenieros; el
-- backfill del final solo les rellena lo que se puede deducir de lo que ya hay.

-- ---------------------------------------------------------------------------
-- 1. Estados nuevos sobre el enum que ya existe.
--    Antes no se podía decir «planeado» (se abría como activo) ni «cancelado»
--    (se dejaba en pausa y nadie sabía si volvería).
-- ---------------------------------------------------------------------------
ALTER TYPE "OperationalProjectStatus" ADD VALUE IF NOT EXISTS 'PLANNED';
ALTER TYPE "OperationalProjectStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- ---------------------------------------------------------------------------
-- 2. Tipos nuevos.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProjectMilestoneStatus') THEN
    CREATE TYPE "ProjectMilestoneStatus" AS ENUM ('PENDIENTE', 'EN_CURSO', 'CUMPLIDO', 'CANCELADO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProjectScopeItemKind') THEN
    CREATE TYPE "ProjectScopeItemKind" AS ENUM ('ENTREGABLE', 'EXCLUSION', 'SUPUESTO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProjectRequirementStatus') THEN
    CREATE TYPE "ProjectRequirementStatus" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'CUMPLIDO', 'NO_APLICA');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProjectMemberRole') THEN
    CREATE TYPE "ProjectMemberRole" AS ENUM ('RESPONSABLE', 'COORDINADOR', 'INGENIERO', 'INSTALADOR', 'ADMINISTRATIVO', 'APOYO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProjectDocumentKind') THEN
    CREATE TYPE "ProjectDocumentKind" AS ENUM ('PLANO', 'ACTA', 'CONTRATO', 'MINUTA', 'REPORTE', 'OTRO');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Columnas nuevas del proyecto.
--    `startDate`/`endDate` ya eran el plan; se suman las reales para poder comparar.
-- ---------------------------------------------------------------------------
ALTER TABLE "operational_projects" ADD COLUMN IF NOT EXISTS "objective" TEXT;
ALTER TABLE "operational_projects" ADD COLUMN IF NOT EXISTS "responsableId" INTEGER;
ALTER TABLE "operational_projects" ADD COLUMN IF NOT EXISTS "actualStartDate" TIMESTAMP(3);
ALTER TABLE "operational_projects" ADD COLUMN IF NOT EXISTS "budgetAmount" DECIMAL(12,2);
ALTER TABLE "operational_projects" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(10) NOT NULL DEFAULT 'MXN';
ALTER TABLE "operational_projects" ADD COLUMN IF NOT EXISTS "cotizacionId" INTEGER;
ALTER TABLE "operational_projects" ADD COLUMN IF NOT EXISTS "cancelReason" VARCHAR(500);

CREATE INDEX IF NOT EXISTS "operational_projects_responsableId_idx" ON "operational_projects"("responsableId");
CREATE INDEX IF NOT EXISTS "operational_projects_cotizacionId_idx" ON "operational_projects"("cotizacionId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operational_projects_responsableId_fkey') THEN
    ALTER TABLE "operational_projects"
      ADD CONSTRAINT "operational_projects_responsableId_fkey"
      FOREIGN KEY ("responsableId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operational_projects_cotizacionId_fkey') THEN
    ALTER TABLE "operational_projects"
      ADD CONSTRAINT "operational_projects_cotizacionId_fkey"
      FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. Cronograma: etapas e hitos.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "project_milestones" (
  "id" SERIAL NOT NULL,
  "projectId" INTEGER NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "plannedDate" TIMESTAMP(3),
  "actualDate" TIMESTAMP(3),
  "responsableId" INTEGER,
  "status" "ProjectMilestoneStatus" NOT NULL DEFAULT 'PENDIENTE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_milestones_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "project_milestones_projectId_idx" ON "project_milestones"("projectId");
CREATE INDEX IF NOT EXISTS "project_milestones_responsableId_idx" ON "project_milestones"("responsableId");

-- ---------------------------------------------------------------------------
-- 5. Alcance: entregables, exclusiones y supuestos (mismo vocabulario que la cotización).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "project_scope_items" (
  "id" SERIAL NOT NULL,
  "projectId" INTEGER NOT NULL,
  "kind" "ProjectScopeItemKind" NOT NULL DEFAULT 'ENTREGABLE',
  "titulo" VARCHAR(240) NOT NULL,
  "detalle" TEXT,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "origenClave" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_scope_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "project_scope_items_projectId_idx" ON "project_scope_items"("projectId");
CREATE INDEX IF NOT EXISTS "project_scope_items_projectId_kind_idx" ON "project_scope_items"("projectId", "kind");

-- ---------------------------------------------------------------------------
-- 6. Requerimientos: checklist con dueño y estado.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "project_requirements" (
  "id" SERIAL NOT NULL,
  "projectId" INTEGER NOT NULL,
  "titulo" VARCHAR(240) NOT NULL,
  "detalle" TEXT,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "responsableId" INTEGER,
  "status" "ProjectRequirementStatus" NOT NULL DEFAULT 'PENDIENTE',
  "dueDate" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_requirements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "project_requirements_projectId_idx" ON "project_requirements"("projectId");
CREATE INDEX IF NOT EXISTS "project_requirements_responsableId_idx" ON "project_requirements"("responsableId");

-- ---------------------------------------------------------------------------
-- 7. Equipo con papel. `project_engineers` se queda como está.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "project_members" (
  "id" SERIAL NOT NULL,
  "projectId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "role" "ProjectMemberRole" NOT NULL DEFAULT 'APOYO',
  "notas" VARCHAR(300),
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "project_members_projectId_userId_key" ON "project_members"("projectId", "userId");
CREATE INDEX IF NOT EXISTS "project_members_projectId_idx" ON "project_members"("projectId");
CREATE INDEX IF NOT EXISTS "project_members_userId_idx" ON "project_members"("userId");

-- ---------------------------------------------------------------------------
-- 8. Documentos (planos, actas).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "project_documents" (
  "id" SERIAL NOT NULL,
  "projectId" INTEGER NOT NULL,
  "kind" "ProjectDocumentKind" NOT NULL DEFAULT 'OTRO',
  "nombre" VARCHAR(220) NOT NULL,
  "fileUrl" VARCHAR(500) NOT NULL,
  "mimeType" VARCHAR(120),
  "fileSizeBytes" INTEGER,
  "uploadedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_documents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "project_documents_projectId_idx" ON "project_documents"("projectId");

-- ---------------------------------------------------------------------------
-- 9. Llaves foráneas de las tablas nuevas.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_milestones_projectId_fkey') THEN
    ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "operational_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_milestones_responsableId_fkey') THEN
    ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_responsableId_fkey"
      FOREIGN KEY ("responsableId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_scope_items_projectId_fkey') THEN
    ALTER TABLE "project_scope_items" ADD CONSTRAINT "project_scope_items_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "operational_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_requirements_projectId_fkey') THEN
    ALTER TABLE "project_requirements" ADD CONSTRAINT "project_requirements_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "operational_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_requirements_responsableId_fkey') THEN
    ALTER TABLE "project_requirements" ADD CONSTRAINT "project_requirements_responsableId_fkey"
      FOREIGN KEY ("responsableId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_members_projectId_fkey') THEN
    ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "operational_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_members_userId_fkey') THEN
    ALTER TABLE "project_members" ADD CONSTRAINT "project_members_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_documents_projectId_fkey') THEN
    ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "operational_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_documents_uploadedById_fkey') THEN
    ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_uploadedById_fkey"
      FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 10. Backfill de lo que ya existe, sin inventar nada.
-- ---------------------------------------------------------------------------

-- 10a. Responsable: si no hay a quién preguntarle, es quien lo abrió.
UPDATE "operational_projects"
   SET "responsableId" = "vendorId"
 WHERE "responsableId" IS NULL;

-- 10b. Inicio real: los proyectos ya terminados sí arrancaron, y la única fecha
--      honesta que tenemos de ese arranque es la planeada.
UPDATE "operational_projects"
   SET "actualStartDate" = "startDate"
 WHERE "actualStartDate" IS NULL
   AND ("status" = 'COMPLETED' OR "actualEndDate" IS NOT NULL);

-- 10c. Estado: no se reclasifica ninguna fila.
--      ACTIVE/ON_HOLD/COMPLETED ya son «En curso»/«En pausa»/«Terminado», así que los
--      proyectos vivos quedan correctos tal cual. Los dos valores nuevos no se pueden
--      usar en esta misma transacción (Postgres no deja leer un valor de enum recién
--      añadido antes del commit), y de todas formas adivinar que algo estaba «planeado»
--      a partir de una fecha sería inventarle un estado a datos reales: PLANNED y
--      CANCELLED empiezan a usarse desde la app, no desde aquí.

-- 10d. Equipo: cada ingeniero ya asignado entra como INGENIERO; el responsable,
--      como RESPONSABLE. Sin duplicar (la unicidad es por proyecto+persona).
INSERT INTO "project_members" ("projectId", "userId", "role", "assignedAt")
SELECT pe."projectId", pe."engineerId", 'INGENIERO'::"ProjectMemberRole", pe."assignedAt"
  FROM "project_engineers" pe
 WHERE NOT EXISTS (
   SELECT 1 FROM "project_members" pm
    WHERE pm."projectId" = pe."projectId" AND pm."userId" = pe."engineerId"
 );

INSERT INTO "project_members" ("projectId", "userId", "role", "assignedAt")
SELECT p."id", p."responsableId", 'RESPONSABLE'::"ProjectMemberRole", p."createdAt"
  FROM "operational_projects" p
 WHERE p."responsableId" IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM "project_members" pm
      WHERE pm."projectId" = p."id" AND pm."userId" = p."responsableId"
   );

-- 10e. Alcance: el resumen que ya traían no se pierde, se convierte en su primer
--      entregable para que la pestaña no aparezca vacía.
INSERT INTO "project_scope_items" ("projectId", "kind", "titulo", "detalle", "orden", "origenClave")
SELECT p."id",
       'ENTREGABLE'::"ProjectScopeItemKind",
       LEFT(p."scopeSummary", 240),
       NULL,
       0,
       'migracion:scopeSummary'
  FROM "operational_projects" p
 WHERE p."scopeSummary" IS NOT NULL
   AND LENGTH(TRIM(p."scopeSummary")) > 0
   AND NOT EXISTS (
     SELECT 1 FROM "project_scope_items" si WHERE si."projectId" = p."id"
   );
