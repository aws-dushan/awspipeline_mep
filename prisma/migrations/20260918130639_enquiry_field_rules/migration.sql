-- Which fields a request must carry is decided per company.
--
-- A row per field per company, rather than only the exceptions: a later change
-- to a built-in default must not silently re-require a field an administrator
-- has turned off.

-- CreateTable
CREATE TABLE "enquiry_field_rules" (
    "companyId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enquiry_field_rules_pkey" PRIMARY KEY ("companyId","field")
);

-- AddForeignKey
ALTER TABLE "enquiry_field_rules" ADD CONSTRAINT "enquiry_field_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
