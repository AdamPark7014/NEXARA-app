-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESPONDED', 'CLOSED');

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(50),
    "company" VARCHAR(200),
    "subject" VARCHAR(150),
    "message" TEXT NOT NULL,
    "newsletter" BOOLEAN NOT NULL DEFAULT false,
    "source" VARCHAR(120),
    "pageUrl" VARCHAR(500),
    "status" "ContactStatus" NOT NULL DEFAULT 'NEW',
    "responseMessage" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);
