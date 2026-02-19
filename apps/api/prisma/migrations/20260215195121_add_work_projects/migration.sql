-- CreateEnum
CREATE TYPE "WorkProjectStatus" AS ENUM ('IN_PROGRESS', 'AT_RISK', 'ON_HOLD', 'COMPLETED');

-- CreateTable
CREATE TABLE "work_projects" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(220) NOT NULL,
    "clientName" VARCHAR(180),
    "managerName" VARCHAR(180),
    "status" "WorkProjectStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "budgetTotal" DECIMAL(12,2),
    "budgetUsed" DECIMAL(12,2),
    "progress" INTEGER DEFAULT 0,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_project_expenses" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "category" VARCHAR(120) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "incurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "work_project_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_project_payroll" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "employee" VARCHAR(160) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "work_project_payroll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_project_logs" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "progress" INTEGER DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_project_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "work_project_expenses" ADD CONSTRAINT "work_project_expenses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "work_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_project_payroll" ADD CONSTRAINT "work_project_payroll_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "work_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_project_logs" ADD CONSTRAINT "work_project_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "work_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
