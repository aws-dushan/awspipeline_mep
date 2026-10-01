-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'QUOTATION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'QUOTATION_VERSION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'QUOTATION_VERSION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'QUOTATION_DOWNLOADED';
ALTER TYPE "AuditAction" ADD VALUE 'QUOTATION_SETTINGS_UPDATED';

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'QUOTATION';

-- CreateTable
CREATE TABLE "quotation_settings" (
    "companyId" TEXT NOT NULL,
    "letterheadName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "footerText" TEXT NOT NULL,
    "referencePrefix" TEXT NOT NULL DEFAULT '',
    "nextReferenceNo" INTEGER NOT NULL DEFAULT 1,
    "defaultScope" TEXT NOT NULL,
    "vatNote" TEXT NOT NULL,
    "defaultTerms" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_settings_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_versions" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "quotationDate" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "salesName" TEXT NOT NULL,
    "salesPhone" TEXT NOT NULL,
    "salesEmail" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "attention" TEXT NOT NULL,
    "attentionPhone" TEXT NOT NULL,
    "customerAddress" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerRef" TEXT NOT NULL,
    "enquiryDate" TIMESTAMP(3),
    "items" JSONB NOT NULL,
    "scopeOfWork" TEXT NOT NULL,
    "vatNote" TEXT NOT NULL,
    "terms" JSONB NOT NULL,
    "currency" TEXT NOT NULL,
    "totalAmount" DECIMAL(16,2) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotations_enquiryId_key" ON "quotations"("enquiryId");

-- CreateIndex
CREATE INDEX "quotations_companyId_idx" ON "quotations"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_companyId_referenceNo_key" ON "quotations"("companyId", "referenceNo");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_versions_quotationId_revision_key" ON "quotation_versions"("quotationId", "revision");

-- AddForeignKey
ALTER TABLE "quotation_settings" ADD CONSTRAINT "quotation_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

