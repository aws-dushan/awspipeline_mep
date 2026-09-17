-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'AUTOMATION_RULE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'AUTOMATION_RULE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'AUTOMATION_RULE_DELETED';

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'AUTOMATION_RULE';

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "whenType" "DropdownTypeKey" NOT NULL,
    "whenValueId" TEXT NOT NULL,
    "thenType" "DropdownTypeKey" NOT NULL,
    "thenValueId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_rules_companyId_isActive_idx" ON "automation_rules"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "automation_rules_companyId_whenValueId_thenType_key" ON "automation_rules"("companyId", "whenValueId", "thenType");

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_whenValueId_fkey" FOREIGN KEY ("whenValueId") REFERENCES "dropdown_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_thenValueId_fkey" FOREIGN KEY ("thenValueId") REFERENCES "dropdown_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;
