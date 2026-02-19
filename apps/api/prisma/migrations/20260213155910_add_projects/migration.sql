-- CreateTable
CREATE TABLE "projects" (
    "id" SERIAL NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(220) NOT NULL,
    "sector" VARCHAR(180) NOT NULL,
    "summary" TEXT,
    "impact" VARCHAR(255),
    "services" TEXT[],
    "tags" TEXT[],
    "highlights" TEXT[],
    "mainImage" VARCHAR(500),
    "gallery" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");
