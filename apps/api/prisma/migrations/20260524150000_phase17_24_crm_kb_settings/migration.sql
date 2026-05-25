-- Fase 17-21 CRM activities + Sales targets + Knowledge Base + Company profile

CREATE TYPE "CrmActivityType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'TASK', 'WHATSAPP', 'VISIT', 'NOTE');
CREATE TYPE "CrmActivityStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED', 'OVERDUE');
CREATE TYPE "SalesTargetPeriod" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');
CREATE TYPE "KbVisibility" AS ENUM ('PUBLIC', 'CLIENT_ONLY', 'INTERNAL');
CREATE TYPE "KbArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "crm_activities" (
    "id" SERIAL NOT NULL,
    "activityType" "CrmActivityType" NOT NULL DEFAULT 'TASK',
    "status" "CrmActivityStatus" NOT NULL DEFAULT 'PENDING',
    "subject" VARCHAR(220) NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "leadId" INTEGER,
    "opportunityId" INTEGER,
    "tenderId" INTEGER,
    "ownerId" INTEGER,
    "createdById" INTEGER,
    "remindAt" TIMESTAMP(3),
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "crm_activities_ownerId_status_dueDate_idx" ON "crm_activities"("ownerId", "status", "dueDate");
CREATE INDEX "crm_activities_leadId_idx" ON "crm_activities"("leadId");
CREATE INDEX "crm_activities_opportunityId_idx" ON "crm_activities"("opportunityId");
CREATE INDEX "crm_activities_tenderId_idx" ON "crm_activities"("tenderId");

ALTER TABLE "crm_activities"
  ADD CONSTRAINT "crm_activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "sales_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "crm_activities_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "sales_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "crm_activities_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "crm_activities_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "crm_activities_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "sales_targets" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "period" "SalesTargetPeriod" NOT NULL DEFAULT 'MONTHLY',
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "quarter" INTEGER,
    "revenueTarget" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "newClientsTarget" INTEGER NOT NULL DEFAULT 0,
    "opportunitiesTarget" INTEGER NOT NULL DEFAULT 0,
    "baseCommissionPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "bonusCommissionPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "bonusThresholdPct" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_targets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sales_targets_ownerId_period_year_month_quarter_key" ON "sales_targets"("ownerId", "period", "year", "month", "quarter");
CREATE INDEX "sales_targets_year_month_idx" ON "sales_targets"("year", "month");

ALTER TABLE "sales_targets"
  ADD CONSTRAINT "sales_targets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "kb_categories" (
    "id" SERIAL NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "icon" VARCHAR(60),
    "visibility" "KbVisibility" NOT NULL DEFAULT 'PUBLIC',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "parentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kb_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kb_categories_slug_key" ON "kb_categories"("slug");

ALTER TABLE "kb_categories"
  ADD CONSTRAINT "kb_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "kb_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "kb_articles" (
    "id" SERIAL NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "title" VARCHAR(220) NOT NULL,
    "excerpt" TEXT,
    "content" TEXT NOT NULL,
    "visibility" "KbVisibility" NOT NULL DEFAULT 'PUBLIC',
    "status" "KbArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "categoryId" INTEGER,
    "authorId" INTEGER,
    "tags" VARCHAR(400),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kb_articles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kb_articles_slug_key" ON "kb_articles"("slug");
CREATE INDEX "kb_articles_status_publishedAt_idx" ON "kb_articles"("status", "publishedAt");
CREATE INDEX "kb_articles_categoryId_idx" ON "kb_articles"("categoryId");

ALTER TABLE "kb_articles"
  ADD CONSTRAINT "kb_articles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "kb_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "kb_articles_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "company_profile" (
    "id" SERIAL NOT NULL,
    "legalName" VARCHAR(220) NOT NULL,
    "tradeName" VARCHAR(220),
    "rfc" VARCHAR(13) NOT NULL,
    "fiscalRegime" VARCHAR(10),
    "fiscalAddress" TEXT,
    "fiscalPostalCode" VARCHAR(10),
    "contactEmail" VARCHAR(180),
    "contactPhone" VARCHAR(60),
    "supportEmail" VARCHAR(180),
    "websiteUrl" VARCHAR(300),
    "logoUrl" VARCHAR(500),
    "logoDarkUrl" VARCHAR(500),
    "faviconUrl" VARCHAR(500),
    "brandPrimary" VARCHAR(20),
    "brandSecondary" VARCHAR(20),
    "defaultBankName" VARCHAR(180),
    "defaultClabe" VARCHAR(20),
    "notificationEmail" VARCHAR(180),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_profile_pkey" PRIMARY KEY ("id")
);
