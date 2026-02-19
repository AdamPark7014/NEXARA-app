-- AlterTable
ALTER TABLE "news_posts" ADD COLUMN     "galleryUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
