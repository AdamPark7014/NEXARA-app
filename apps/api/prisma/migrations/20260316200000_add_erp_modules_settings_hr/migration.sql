-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'CREDITED');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHECK', 'CREDIT_CARD', 'SPEI', 'DOMICILIACION', 'CARD_DEBIT', 'DIGITAL_WALLET', 'COMPENSATION', 'OTHER');

-- CreateEnum
CREATE TYPE "CfdiUsage" AS ENUM ('G01', 'G02', 'G03', 'I01', 'I02', 'I03', 'I04', 'I05', 'I06', 'I07', 'I08', 'D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'D10', 'P01', 'S01', 'CP01');

-- CreateEnum
CREATE TYPE "FiscalRegime" AS ENUM ('R601', 'R603', 'R605', 'R606', 'R607', 'R608', 'R610', 'R611', 'R612', 'R614', 'R615', 'R616', 'R620', 'R621', 'R622', 'R623', 'R624', 'R625', 'R626');

-- CreateEnum
CREATE TYPE "SatPaymentForm" AS ENUM ('FP01', 'FP02', 'FP03', 'FP04', 'FP05', 'FP06', 'FP08', 'FP12', 'FP13', 'FP14', 'FP15', 'FP17', 'FP23', 'FP24', 'FP25', 'FP26', 'FP27', 'FP28', 'FP29', 'FP30', 'FP31', 'FP99');

-- CreateEnum
CREATE TYPE "SatPaymentMethod" AS ENUM ('PUE', 'PPD');

-- CreateEnum
CREATE TYPE "BankReconciliationStatus" AS ENUM ('PENDING', 'MATCHED', 'UNMATCHED', 'ADJUSTED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'DISPATCH', 'TRANSFER', 'ADJUSTMENT', 'RETURN', 'SCRAP', 'PRODUCTION_IN', 'PRODUCTION_OUT');

-- CreateEnum
CREATE TYPE "ValuationMethod" AS ENUM ('FIFO', 'LIFO', 'WEIGHTED_AVERAGE');

-- CreateEnum
CREATE TYPE "PurchaseRequisitionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ORDERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'INVOICED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductionOrderStatus" AS ENUM ('PLANNED', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QualityInspectionType" AS ENUM ('INCOMING', 'IN_PROCESS', 'FINAL', 'RANDOM');

-- CreateEnum
CREATE TYPE "QualityInspectionResult" AS ENUM ('PASSED', 'FAILED', 'CONDITIONAL');

-- CreateEnum
CREATE TYPE "NCRStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'CORRECTIVE_ACTION', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "NCRSeverity" AS ENUM ('MINOR', 'MAJOR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('PREVENTIVE', 'CORRECTIVE', 'PREDICTIVE');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('OPERATIONAL', 'UNDER_MAINTENANCE', 'OUT_OF_SERVICE', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('NEAR_MISS', 'FIRST_AID', 'MEDICAL', 'LOST_TIME', 'FATALITY');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('REPORTED', 'INVESTIGATING', 'CORRECTIVE_ACTION', 'CLOSED');

-- CreateEnum
CREATE TYPE "WorkPermitType" AS ENUM ('HOT_WORK', 'CONFINED_SPACE', 'HEIGHTS', 'ELECTRICAL', 'EXCAVATION', 'GENERAL');

-- CreateEnum
CREATE TYPE "WorkPermitStatus" AS ENUM ('REQUESTED', 'APPROVED', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'OBSOLETE');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('VACATION', 'SICK', 'PERSONAL', 'MATERNITY', 'PATERNITY', 'BEREAVEMENT', 'UNPAID');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewPeriod" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED');

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CvCandidate" ALTER COLUMN "tags" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "accesoAuditoria" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoBI" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoBanca" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoCalidad" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoClientes" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoCompras" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoDocumentos" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoInventario" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoLunchBreaks" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoMantenimiento" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoManufactura" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoMultas" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoSeguridad" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoWorkflow" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "cotizaciones" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "showInCatalog";

-- AlterTable
ALTER TABLE "viaticos" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "work_projects" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "accounts" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" "AccountType" NOT NULL,
    "parentId" INTEGER,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'MXN',
    "balance" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_periods" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "closedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" SERIAL NOT NULL,
    "entryNumber" VARCHAR(30) NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference" VARCHAR(100),
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "fiscalPeriodId" INTEGER,
    "reversalOfId" INTEGER,
    "totalDebit" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "totalCredit" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entry_lines" (
    "id" SERIAL NOT NULL,
    "journalEntryId" INTEGER NOT NULL,
    "debitAccountId" INTEGER NOT NULL,
    "creditAccountId" INTEGER,
    "description" VARCHAR(300),
    "debit" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "costCenterId" INTEGER,

    CONSTRAINT "journal_entry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "departmentId" INTEGER,
    "defaultAccountId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "invoiceNumber" VARCHAR(40) NOT NULL,
    "type" "InvoiceType" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "clientId" INTEGER,
    "supplierId" INTEGER,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'MXN',
    "notes" TEXT,
    "cfdiUuid" VARCHAR(80),
    "cfdiXml" TEXT,
    "pdfUrl" VARCHAR(500),
    "cfdiVersion" VARCHAR(5) DEFAULT '4.0',
    "cfdiSerie" VARCHAR(25),
    "cfdiFolio" VARCHAR(40),
    "cfdiUsage" "CfdiUsage" DEFAULT 'G03',
    "satPaymentForm" "SatPaymentForm" DEFAULT 'FP99',
    "satPaymentMethod" "SatPaymentMethod" DEFAULT 'PUE',
    "emisorRfc" VARCHAR(13),
    "emisorName" VARCHAR(300),
    "emisorRegime" "FiscalRegime" DEFAULT 'R601',
    "receptorRfc" VARCHAR(13),
    "receptorName" VARCHAR(300),
    "receptorRegime" "FiscalRegime",
    "receptorZipCode" VARCHAR(5),
    "exchangeRate" DECIMAL(10,4),
    "cfdiStampDate" TIMESTAMP(3),
    "satCertNumber" VARCHAR(30),
    "cfdiRelationType" VARCHAR(5),
    "cfdiRelatedUuids" TEXT,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" VARCHAR(5),
    "substitutionUuid" VARCHAR(80),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "productId" INTEGER,
    "satProductKey" VARCHAR(10),
    "satUnitKey" VARCHAR(5),
    "unitName" VARCHAR(50),
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxBase" DECIMAL(14,2),
    "ivaRate" DECIMAL(5,2),
    "ivaAmount" DECIMAL(14,2),
    "iepsRate" DECIMAL(5,2),
    "iepsAmount" DECIMAL(14,2),
    "isrRetRate" DECIMAL(5,2),
    "isrRetAmount" DECIMAL(14,2),
    "ivaRetRate" DECIMAL(5,4),
    "ivaRetAmount" DECIMAL(14,2),

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paymentDate" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'SPEI',
    "reference" VARCHAR(100),
    "bankAccountId" INTEGER,
    "notes" TEXT,
    "satPaymentForm" "SatPaymentForm" DEFAULT 'FP03',
    "speiTrackingKey" VARCHAR(30),
    "exchangeRate" DECIMAL(10,4),
    "operationNumber" VARCHAR(50),
    "cfdiPaymentUuid" VARCHAR(80),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "bankName" VARCHAR(200) NOT NULL,
    "accountNumber" VARCHAR(40) NOT NULL,
    "clabe" VARCHAR(20),
    "currency" VARCHAR(10) NOT NULL DEFAULT 'MXN',
    "currentBalance" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "bankCode" VARCHAR(10),
    "rfc" VARCHAR(13),
    "accountType" VARCHAR(30),
    "branch" VARCHAR(10),
    "lastSyncAt" TIMESTAMP(3),
    "speiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "cepUrl" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" SERIAL NOT NULL,
    "bankAccountId" INTEGER NOT NULL,
    "transactionDate" DATE NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "isDebit" BOOLEAN NOT NULL,
    "externalRef" VARCHAR(100),
    "speiTrackingKey" VARCHAR(30),
    "speiCep" TEXT,
    "counterpartyRfc" VARCHAR(13),
    "counterpartyName" VARCHAR(300),
    "counterpartyClabe" VARCHAR(20),
    "counterpartyBank" VARCHAR(100),
    "concept" VARCHAR(200),
    "beneficiaryRef" VARCHAR(7),
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_reconciliations" (
    "id" SERIAL NOT NULL,
    "bankAccountId" INTEGER NOT NULL,
    "bankTransactionId" INTEGER NOT NULL,
    "status" "BankReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "matchedAmount" DECIMAL(14,2),
    "notes" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "reconciledById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "costCenterId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "plannedAmount" DECIMAL(14,2) NOT NULL,
    "actualAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "address" TEXT,
    "city" VARCHAR(120),
    "state" VARCHAR(120),
    "managerId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_locations" (
    "id" SERIAL NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "aisle" VARCHAR(20),
    "rack" VARCHAR(20),
    "shelf" VARCHAR(20),
    "bin" VARCHAR(20),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_levels" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "locationId" INTEGER,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "reservedQty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "reorderPoint" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "minStock" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "maxStock" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "valuationMethod" "ValuationMethod" NOT NULL DEFAULT 'WEIGHTED_AVERAGE',
    "lastCountDate" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" SERIAL NOT NULL,
    "movementNumber" VARCHAR(30) NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "productId" INTEGER NOT NULL,
    "fromWarehouseId" INTEGER,
    "toWarehouseId" INTEGER,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lotId" INTEGER,
    "reference" VARCHAR(200),
    "notes" TEXT,
    "purchaseOrderId" INTEGER,
    "productionOrderId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" SERIAL NOT NULL,
    "lotNumber" VARCHAR(60) NOT NULL,
    "productId" INTEGER NOT NULL,
    "expirationDate" TIMESTAMP(3),
    "manufacturingDate" TIMESTAMP(3),
    "supplierId" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_stocks" (
    "id" SERIAL NOT NULL,
    "lotId" INTEGER NOT NULL,
    "stockLevelId" INTEGER NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "lot_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_requisitions" (
    "id" SERIAL NOT NULL,
    "reqNumber" VARCHAR(30) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "PurchaseRequisitionStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    "requiredDate" DATE,
    "departmentId" INTEGER,
    "requestedById" INTEGER NOT NULL,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_requisition_items" (
    "id" SERIAL NOT NULL,
    "requisitionId" INTEGER NOT NULL,
    "productId" INTEGER,
    "description" VARCHAR(300) NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "estimatedCost" DECIMAL(14,2),
    "notes" TEXT,

    CONSTRAINT "purchase_requisition_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" SERIAL NOT NULL,
    "poNumber" VARCHAR(30) NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "supplierId" INTEGER NOT NULL,
    "requisitionId" INTEGER,
    "orderDate" DATE NOT NULL,
    "expectedDate" DATE,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'MXN',
    "paymentTerms" VARCHAR(200),
    "shippingAddress" TEXT,
    "notes" TEXT,
    "createdById" INTEGER,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" SERIAL NOT NULL,
    "purchaseOrderId" INTEGER NOT NULL,
    "productId" INTEGER,
    "description" VARCHAR(300) NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "receivedQty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" SERIAL NOT NULL,
    "receiptNumber" VARCHAR(30) NOT NULL,
    "purchaseOrderId" INTEGER NOT NULL,
    "receiptDate" DATE NOT NULL,
    "notes" TEXT,
    "receivedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_items" (
    "id" SERIAL NOT NULL,
    "goodsReceiptId" INTEGER NOT NULL,
    "purchaseOrderItemId" INTEGER NOT NULL,
    "quantityReceived" DECIMAL(14,4) NOT NULL,
    "quantityRejected" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "lotNumber" VARCHAR(60),
    "notes" TEXT,

    CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_evaluations" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "evaluationDate" DATE NOT NULL,
    "qualityScore" INTEGER NOT NULL DEFAULT 0,
    "deliveryScore" INTEGER NOT NULL DEFAULT 0,
    "priceScore" INTEGER NOT NULL DEFAULT 0,
    "serviceScore" INTEGER NOT NULL DEFAULT 0,
    "overallScore" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "evaluatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills_of_materials" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "version" VARCHAR(20) NOT NULL DEFAULT '1.0',
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "standardQty" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "unitOfMeasure" VARCHAR(20) NOT NULL DEFAULT 'PZA',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_of_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_components" (
    "id" SERIAL NOT NULL,
    "bomId" INTEGER NOT NULL,
    "componentProductId" INTEGER NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unitOfMeasure" VARCHAR(20) NOT NULL DEFAULT 'PZA',
    "scrapPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bom_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_centers" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "costPerHour" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "capacityPerHour" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_routings" (
    "id" SERIAL NOT NULL,
    "bomId" INTEGER NOT NULL,
    "operationNumber" INTEGER NOT NULL,
    "workCenterId" INTEGER NOT NULL,
    "operationName" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "setupTimeMin" INTEGER NOT NULL DEFAULT 0,
    "runTimeMin" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "production_routings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_orders" (
    "id" SERIAL NOT NULL,
    "orderNumber" VARCHAR(30) NOT NULL,
    "bomId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'PLANNED',
    "plannedQty" DECIMAL(14,4) NOT NULL,
    "completedQty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "scrapQty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "plannedStartDate" DATE,
    "plannedEndDate" DATE,
    "actualStartDate" TIMESTAMP(3),
    "actualEndDate" TIMESTAMP(3),
    "estimatedCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "actualCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "priority" VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    "notes" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_logs" (
    "id" SERIAL NOT NULL,
    "productionOrderId" INTEGER NOT NULL,
    "workCenterId" INTEGER NOT NULL,
    "operatorId" INTEGER,
    "operationName" VARCHAR(200) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "quantityProduced" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "quantityScrapped" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "laborCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "materialCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "overheadCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_inspections" (
    "id" SERIAL NOT NULL,
    "inspectionNumber" VARCHAR(30) NOT NULL,
    "type" "QualityInspectionType" NOT NULL,
    "result" "QualityInspectionResult",
    "productId" INTEGER,
    "lotId" INTEGER,
    "purchaseOrderId" INTEGER,
    "productionOrderId" INTEGER,
    "inspectedQty" DECIMAL(14,4) NOT NULL,
    "passedQty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "failedQty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "inspectionDate" DATE NOT NULL,
    "inspectorId" INTEGER,
    "notes" TEXT,
    "reportUrl" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "quality_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_checklist_items" (
    "id" SERIAL NOT NULL,
    "inspectionId" INTEGER NOT NULL,
    "parameter" VARCHAR(200) NOT NULL,
    "specification" VARCHAR(300),
    "actualValue" VARCHAR(300),
    "passed" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quality_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "non_conformance_reports" (
    "id" SERIAL NOT NULL,
    "ncrNumber" VARCHAR(30) NOT NULL,
    "status" "NCRStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "NCRSeverity" NOT NULL DEFAULT 'MINOR',
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT NOT NULL,
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "preventiveAction" TEXT,
    "inspectionId" INTEGER,
    "productId" INTEGER,
    "reportedById" INTEGER NOT NULL,
    "assignedToId" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "non_conformance_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100),
    "location" VARCHAR(200),
    "manufacturer" VARCHAR(200),
    "model" VARCHAR(200),
    "serialNumber" VARCHAR(100),
    "purchaseDate" DATE,
    "purchaseCost" DECIMAL(14,2),
    "warrantyExpiry" DATE,
    "expectedLifeYears" INTEGER,
    "status" "AssetStatus" NOT NULL DEFAULT 'OPERATIONAL',
    "imageUrl" VARCHAR(500),
    "responsibleId" INTEGER,
    "parentAssetId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_schedules" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "type" "MaintenanceType" NOT NULL DEFAULT 'PREVENTIVE',
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "frequencyDays" INTEGER NOT NULL,
    "lastExecutedAt" TIMESTAMP(3),
    "nextDueDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_orders" (
    "id" SERIAL NOT NULL,
    "orderNumber" VARCHAR(30) NOT NULL,
    "assetId" INTEGER NOT NULL,
    "scheduleId" INTEGER,
    "type" "MaintenanceType" NOT NULL,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'PLANNED',
    "priority" VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "diagnosis" TEXT,
    "workPerformed" TEXT,
    "plannedDate" DATE NOT NULL,
    "completedDate" TIMESTAMP(3),
    "downTimeMinutes" INTEGER,
    "laborCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "partsCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "assignedToId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "maintenance_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_order_parts" (
    "id" SERIAL NOT NULL,
    "maintenanceOrderId" INTEGER NOT NULL,
    "productId" INTEGER,
    "partName" VARCHAR(200) NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "maintenance_order_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_incidents" (
    "id" SERIAL NOT NULL,
    "incidentNumber" VARCHAR(30) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'REPORTED',
    "incidentDate" TIMESTAMP(3) NOT NULL,
    "location" VARCHAR(200),
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "reportedById" INTEGER NOT NULL,
    "assignedToId" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_permits" (
    "id" SERIAL NOT NULL,
    "permitNumber" VARCHAR(30) NOT NULL,
    "type" "WorkPermitType" NOT NULL,
    "status" "WorkPermitStatus" NOT NULL DEFAULT 'REQUESTED',
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "location" VARCHAR(200),
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "requestedById" INTEGER NOT NULL,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_permits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_records" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "courseName" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "provider" VARCHAR(200),
    "completedDate" DATE NOT NULL,
    "expirationDate" DATE,
    "certificateUrl" VARCHAR(500),
    "score" DECIMAL(5,2),
    "status" VARCHAR(30) NOT NULL DEFAULT 'VALID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_categories" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "parentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "managed_documents" (
    "id" SERIAL NOT NULL,
    "documentNumber" VARCHAR(40) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "categoryId" INTEGER,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "fileUrl" VARCHAR(500),
    "mimeType" VARCHAR(100),
    "fileSizeBytes" INTEGER,
    "retentionDays" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "managed_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileUrl" VARCHAR(500) NOT NULL,
    "changelog" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_definitions" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "entityType" VARCHAR(100) NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" SERIAL NOT NULL,
    "workflowId" INTEGER NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "approverRoleId" INTEGER,
    "approverUserId" INTEGER,
    "autoApproveCondition" TEXT,
    "timeoutHours" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_instances" (
    "id" SERIAL NOT NULL,
    "workflowId" INTEGER NOT NULL,
    "entityId" INTEGER NOT NULL,
    "entityType" VARCHAR(100) NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "startedById" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "workflow_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_approvals" (
    "id" SERIAL NOT NULL,
    "instanceId" INTEGER NOT NULL,
    "stepId" INTEGER NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "comments" TEXT,
    "decidedById" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "entityType" VARCHAR(100) NOT NULL,
    "entityId" INTEGER NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "changes" JSONB,
    "previousData" JSONB,
    "userId" INTEGER,
    "ipAddress" VARCHAR(45),
    "userAgent" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_snapshots" (
    "id" SERIAL NOT NULL,
    "kpiName" VARCHAR(100) NOT NULL,
    "kpiCategory" VARCHAR(60) NOT NULL,
    "value" DECIMAL(16,4) NOT NULL,
    "unit" VARCHAR(30),
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "value" TEXT NOT NULL,
    "category" VARCHAR(60) NOT NULL,
    "label" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "LeaveType" NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_reviews" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "reviewerId" INTEGER NOT NULL,
    "period" "ReviewPeriod" NOT NULL,
    "reviewDate" DATE NOT NULL,
    "overallRating" DOUBLE PRECISION NOT NULL,
    "strengths" TEXT,
    "areasOfImprovement" TEXT,
    "goals" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_code_key" ON "accounts"("code");

-- CreateIndex
CREATE INDEX "accounts_type_idx" ON "accounts"("type");

-- CreateIndex
CREATE INDEX "accounts_parentId_idx" ON "accounts"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_periods_startDate_endDate_key" ON "fiscal_periods"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_entryNumber_key" ON "journal_entries"("entryNumber");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reversalOfId_key" ON "journal_entries"("reversalOfId");

-- CreateIndex
CREATE INDEX "journal_entries_date_idx" ON "journal_entries"("date");

-- CreateIndex
CREATE INDEX "journal_entries_status_idx" ON "journal_entries"("status");

-- CreateIndex
CREATE INDEX "journal_entry_lines_journalEntryId_idx" ON "journal_entry_lines"("journalEntryId");

-- CreateIndex
CREATE INDEX "journal_entry_lines_debitAccountId_idx" ON "journal_entry_lines"("debitAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_code_key" ON "cost_centers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "invoices_type_status_idx" ON "invoices"("type", "status");

-- CreateIndex
CREATE INDEX "invoices_dueDate_idx" ON "invoices"("dueDate");

-- CreateIndex
CREATE INDEX "invoices_cfdiUuid_idx" ON "invoices"("cfdiUuid");

-- CreateIndex
CREATE INDEX "invoices_emisorRfc_idx" ON "invoices"("emisorRfc");

-- CreateIndex
CREATE INDEX "invoices_receptorRfc_idx" ON "invoices"("receptorRfc");

-- CreateIndex
CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");

-- CreateIndex
CREATE INDEX "bank_transactions_bankAccountId_transactionDate_idx" ON "bank_transactions"("bankAccountId", "transactionDate");

-- CreateIndex
CREATE INDEX "bank_transactions_speiTrackingKey_idx" ON "bank_transactions"("speiTrackingKey");

-- CreateIndex
CREATE UNIQUE INDEX "bank_reconciliations_bankTransactionId_key" ON "bank_reconciliations"("bankTransactionId");

-- CreateIndex
CREATE INDEX "bank_reconciliations_bankAccountId_status_idx" ON "bank_reconciliations"("bankAccountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_costCenterId_year_month_key" ON "budgets"("costCenterId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_locations_warehouseId_code_key" ON "warehouse_locations"("warehouseId", "code");

-- CreateIndex
CREATE INDEX "stock_levels_warehouseId_idx" ON "stock_levels"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_levels_productId_warehouseId_locationId_key" ON "stock_levels"("productId", "warehouseId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_movementNumber_key" ON "stock_movements"("movementNumber");

-- CreateIndex
CREATE INDEX "stock_movements_productId_type_idx" ON "stock_movements"("productId", "type");

-- CreateIndex
CREATE INDEX "stock_movements_createdAt_idx" ON "stock_movements"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "lots_lotNumber_key" ON "lots"("lotNumber");

-- CreateIndex
CREATE INDEX "lots_productId_idx" ON "lots"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "lot_stocks_lotId_stockLevelId_key" ON "lot_stocks"("lotId", "stockLevelId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requisitions_reqNumber_key" ON "purchase_requisitions"("reqNumber");

-- CreateIndex
CREATE INDEX "purchase_requisitions_status_idx" ON "purchase_requisitions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_poNumber_key" ON "purchase_orders"("poNumber");

-- CreateIndex
CREATE INDEX "purchase_orders_supplierId_status_idx" ON "purchase_orders"("supplierId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_receiptNumber_key" ON "goods_receipts"("receiptNumber");

-- CreateIndex
CREATE INDEX "goods_receipts_purchaseOrderId_idx" ON "goods_receipts"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "supplier_evaluations_supplierId_idx" ON "supplier_evaluations"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "bills_of_materials_productId_version_key" ON "bills_of_materials"("productId", "version");

-- CreateIndex
CREATE INDEX "bom_components_bomId_idx" ON "bom_components"("bomId");

-- CreateIndex
CREATE UNIQUE INDEX "work_centers_code_key" ON "work_centers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "production_routings_bomId_operationNumber_key" ON "production_routings"("bomId", "operationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_orderNumber_key" ON "production_orders"("orderNumber");

-- CreateIndex
CREATE INDEX "production_orders_status_idx" ON "production_orders"("status");

-- CreateIndex
CREATE INDEX "production_logs_productionOrderId_idx" ON "production_logs"("productionOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "quality_inspections_inspectionNumber_key" ON "quality_inspections"("inspectionNumber");

-- CreateIndex
CREATE INDEX "quality_inspections_type_result_idx" ON "quality_inspections"("type", "result");

-- CreateIndex
CREATE UNIQUE INDEX "non_conformance_reports_ncrNumber_key" ON "non_conformance_reports"("ncrNumber");

-- CreateIndex
CREATE INDEX "non_conformance_reports_status_severity_idx" ON "non_conformance_reports"("status", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "assets_code_key" ON "assets"("code");

-- CreateIndex
CREATE INDEX "assets_status_idx" ON "assets"("status");

-- CreateIndex
CREATE INDEX "maintenance_schedules_nextDueDate_idx" ON "maintenance_schedules"("nextDueDate");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_orders_orderNumber_key" ON "maintenance_orders"("orderNumber");

-- CreateIndex
CREATE INDEX "maintenance_orders_assetId_status_idx" ON "maintenance_orders"("assetId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "safety_incidents_incidentNumber_key" ON "safety_incidents"("incidentNumber");

-- CreateIndex
CREATE INDEX "safety_incidents_severity_status_idx" ON "safety_incidents"("severity", "status");

-- CreateIndex
CREATE UNIQUE INDEX "work_permits_permitNumber_key" ON "work_permits"("permitNumber");

-- CreateIndex
CREATE INDEX "work_permits_type_status_idx" ON "work_permits"("type", "status");

-- CreateIndex
CREATE INDEX "training_records_userId_expirationDate_idx" ON "training_records"("userId", "expirationDate");

-- CreateIndex
CREATE UNIQUE INDEX "document_categories_name_key" ON "document_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "managed_documents_documentNumber_key" ON "managed_documents"("documentNumber");

-- CreateIndex
CREATE INDEX "managed_documents_status_idx" ON "managed_documents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_documentId_versionNumber_key" ON "document_versions"("documentId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_definitions_name_key" ON "workflow_definitions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_steps_workflowId_stepNumber_key" ON "workflow_steps"("workflowId", "stepNumber");

-- CreateIndex
CREATE INDEX "workflow_instances_entityType_entityId_idx" ON "workflow_instances"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "workflow_approvals_instanceId_status_idx" ON "workflow_approvals"("instanceId", "status");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "kpi_snapshots_kpiName_periodStart_idx" ON "kpi_snapshots"("kpiName", "periodStart");

-- CreateIndex
CREATE INDEX "kpi_snapshots_kpiCategory_idx" ON "kpi_snapshots"("kpiCategory");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE INDEX "system_settings_category_idx" ON "system_settings"("category");

-- CreateIndex
CREATE INDEX "user_preferences_userId_idx" ON "user_preferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key_key" ON "user_preferences"("userId", "key");

-- CreateIndex
CREATE INDEX "leave_requests_userId_idx" ON "leave_requests"("userId");

-- CreateIndex
CREATE INDEX "leave_requests_status_idx" ON "leave_requests"("status");

-- CreateIndex
CREATE INDEX "leave_requests_startDate_endDate_idx" ON "leave_requests"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "performance_reviews_userId_idx" ON "performance_reviews"("userId");

-- CreateIndex
CREATE INDEX "performance_reviews_reviewerId_idx" ON "performance_reviews"("reviewerId");

-- CreateIndex
CREATE INDEX "performance_reviews_period_reviewDate_idx" ON "performance_reviews"("period", "reviewDate");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_fiscalPeriodId_fkey" FOREIGN KEY ("fiscalPeriodId") REFERENCES "fiscal_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_debitAccountId_fkey" FOREIGN KEY ("debitAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_defaultAccountId_fkey" FOREIGN KEY ("defaultAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "sales_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_reconciledById_fkey" FOREIGN KEY ("reconciledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_locations" ADD CONSTRAINT "warehouse_locations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_stocks" ADD CONSTRAINT "lot_stocks_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_stocks" ADD CONSTRAINT "lot_stocks_stockLevelId_fkey" FOREIGN KEY ("stockLevelId") REFERENCES "stock_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisition_items" ADD CONSTRAINT "purchase_requisition_items_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "purchase_requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisition_items" ADD CONSTRAINT "purchase_requisition_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "purchase_requisitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_evaluations" ADD CONSTRAINT "supplier_evaluations_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_evaluations" ADD CONSTRAINT "supplier_evaluations_evaluatedById_fkey" FOREIGN KEY ("evaluatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills_of_materials" ADD CONSTRAINT "bills_of_materials_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills_of_materials" ADD CONSTRAINT "bills_of_materials_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "bills_of_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_routings" ADD CONSTRAINT "production_routings_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "bills_of_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_routings" ADD CONSTRAINT "production_routings_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "work_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "bills_of_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_logs" ADD CONSTRAINT "production_logs_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_logs" ADD CONSTRAINT "production_logs_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "work_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_logs" ADD CONSTRAINT "production_logs_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_checklist_items" ADD CONSTRAINT "quality_checklist_items_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "quality_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_conformance_reports" ADD CONSTRAINT "non_conformance_reports_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "quality_inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_conformance_reports" ADD CONSTRAINT "non_conformance_reports_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_conformance_reports" ADD CONSTRAINT "non_conformance_reports_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_conformance_reports" ADD CONSTRAINT "non_conformance_reports_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "maintenance_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_order_parts" ADD CONSTRAINT "maintenance_order_parts_maintenanceOrderId_fkey" FOREIGN KEY ("maintenanceOrderId") REFERENCES "maintenance_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_order_parts" ADD CONSTRAINT "maintenance_order_parts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_permits" ADD CONSTRAINT "work_permits_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_permits" ADD CONSTRAINT "work_permits_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_categories" ADD CONSTRAINT "document_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "document_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_documents" ADD CONSTRAINT "managed_documents_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "document_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_documents" ADD CONSTRAINT "managed_documents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_documents" ADD CONSTRAINT "managed_documents_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "managed_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflow_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_approverRoleId_fkey" FOREIGN KEY ("approverRoleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflow_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_approvals" ADD CONSTRAINT "workflow_approvals_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_approvals" ADD CONSTRAINT "workflow_approvals_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "workflow_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_approvals" ADD CONSTRAINT "workflow_approvals_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

