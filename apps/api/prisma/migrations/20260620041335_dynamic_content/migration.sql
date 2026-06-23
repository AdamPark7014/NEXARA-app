-- Migration: dynamic_content
-- Adds: User.managerId (orgchart), CaseStudy, SocialPost, InternalComunicado

-- ============================================================
-- 1. Orgchart — jerarquía de reportes
-- ============================================================
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "managerId" INTEGER;
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 2. Casos de éxito
-- ============================================================
CREATE TABLE IF NOT EXISTS "CaseStudy" (
  "id"          SERIAL PRIMARY KEY,
  "titulo"      VARCHAR(200)  NOT NULL,
  "slug"        VARCHAR(220)  NOT NULL UNIQUE,
  "cliente"     VARCHAR(200)  NOT NULL,
  "vertical"    VARCHAR(80)   NOT NULL,
  "impacto"     VARCHAR(500)  NOT NULL,
  "descripcion" TEXT,
  "cover"       VARCHAR(10),
  "imageUrl"    VARCHAR(500),
  "publicado"   BOOLEAN       NOT NULL DEFAULT FALSE,
  "autorId"     INTEGER       NOT NULL,
  "createdAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaseStudy_autorId_fkey" FOREIGN KEY ("autorId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CaseStudy_publicado_idx" ON "CaseStudy"("publicado");
CREATE INDEX IF NOT EXISTS "CaseStudy_slug_idx" ON "CaseStudy"("slug");

-- ============================================================
-- 3. Posts de redes sociales
-- ============================================================
CREATE TABLE IF NOT EXISTS "SocialPost" (
  "id"        SERIAL PRIMARY KEY,
  "red"       VARCHAR(40)   NOT NULL,
  "titulo"    VARCHAR(300)  NOT NULL,
  "contenido" TEXT,
  "mediaUrl"  VARCHAR(500),
  "cuando"    TIMESTAMP(3)  NOT NULL,
  "estado"    VARCHAR(30)   NOT NULL DEFAULT 'Borrador',
  "autorId"   INTEGER       NOT NULL,
  "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialPost_autorId_fkey" FOREIGN KEY ("autorId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SocialPost_estado_cuando_idx" ON "SocialPost"("estado", "cuando");

-- ============================================================
-- 4. Comunicados internos
-- ============================================================
CREATE TABLE IF NOT EXISTS "InternalComunicado" (
  "id"                 SERIAL PRIMARY KEY,
  "titulo"             VARCHAR(300) NOT NULL,
  "cuerpo"             TEXT         NOT NULL,
  "audiencia"          VARCHAR(200) NOT NULL,
  "prioridad"          VARCHAR(20)  NOT NULL DEFAULT 'Normal',
  "estado"             VARCHAR(20)  NOT NULL DEFAULT 'Borrador',
  "scheduledAt"        TIMESTAMP(3),
  "sentAt"             TIMESTAMP(3),
  "lecturas"           INTEGER      NOT NULL DEFAULT 0,
  "totalDestinatarios" INTEGER      NOT NULL DEFAULT 0,
  "autorId"            INTEGER      NOT NULL,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InternalComunicado_autorId_fkey" FOREIGN KEY ("autorId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "InternalComunicado_estado_createdAt_idx"
  ON "InternalComunicado"("estado", "createdAt");
