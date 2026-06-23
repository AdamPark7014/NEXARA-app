-- AlterTable
ALTER TABLE "sales_project_orders" ADD COLUMN     "templateId" INTEGER;

-- CreateTable
CREATE TABLE "order_templates" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "headerLogo" VARCHAR(500),
    "headerText" VARCHAR(500),
    "companyName" VARCHAR(200),
    "companyEmail" VARCHAR(150),
    "companyPhone" VARCHAR(60),
    "footerText" TEXT,
    "footerAlignment" VARCHAR(20) NOT NULL DEFAULT 'center',
    "primaryColor" VARCHAR(20) NOT NULL DEFAULT '#0f6ad6',
    "secondaryColor" VARCHAR(20) NOT NULL DEFAULT '#f5f5f5',
    "textColor" VARCHAR(20) NOT NULL DEFAULT '#000000',
    "sections" JSONB,
    "customCss" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_templates_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "sales_project_orders" ADD CONSTRAINT "sales_project_orders_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "order_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_templates" ADD CONSTRAINT "order_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
