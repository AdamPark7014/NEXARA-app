-- Origen externo del proyecto (p. ej. carpeta de la NAS). Aditiva: no toca datos.
ALTER TABLE "operational_projects" ADD COLUMN "fuente" VARCHAR(40);
ALTER TABLE "operational_projects" ADD COLUMN "fuenteRef" VARCHAR(500);

-- Llave de la carga: repetirla actualiza el mismo proyecto. Los NULL no chocan entre sí.
CREATE UNIQUE INDEX "operational_projects_companyId_fuente_fuenteRef_key"
  ON "operational_projects"("companyId", "fuente", "fuenteRef");
