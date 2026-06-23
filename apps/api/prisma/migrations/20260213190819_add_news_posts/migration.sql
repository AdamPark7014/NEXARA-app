-- CreateEnum
CREATE TYPE "NewsStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "news_posts" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(220) NOT NULL,
    "slug" VARCHAR(220) NOT NULL,
    "summary" VARCHAR(500),
    "content" TEXT NOT NULL,
    "coverImageUrl" VARCHAR(500),
    "status" "NewsStatus" NOT NULL DEFAULT 'DRAFT',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "news_posts_slug_key" ON "news_posts"("slug");
