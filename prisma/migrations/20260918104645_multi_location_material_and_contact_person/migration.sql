-- A request can cover several locations and several materials, and both the
-- customer and the request can name a contact person.
--
-- The existing single values are carried into the new tables before the
-- columns holding them are dropped. Doing it the other way round would lose
-- every location and material already recorded.

-- CreateTable
CREATE TABLE "enquiry_locations" (
    "enquiryId" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,

    CONSTRAINT "enquiry_locations_pkey" PRIMARY KEY ("enquiryId","valueId")
);

-- CreateTable
CREATE TABLE "enquiry_materials" (
    "enquiryId" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,

    CONSTRAINT "enquiry_materials_pkey" PRIMARY KEY ("enquiryId","valueId")
);

-- CreateIndex
CREATE INDEX "enquiry_locations_valueId_idx" ON "enquiry_locations"("valueId");

-- CreateIndex
CREATE INDEX "enquiry_materials_valueId_idx" ON "enquiry_materials"("valueId");

-- AddForeignKey
ALTER TABLE "enquiry_locations" ADD CONSTRAINT "enquiry_locations_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_locations" ADD CONSTRAINT "enquiry_locations_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "dropdown_values"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_materials" ADD CONSTRAINT "enquiry_materials_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_materials" ADD CONSTRAINT "enquiry_materials_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "dropdown_values"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Carry the existing single values across, before dropping the columns.
INSERT INTO "enquiry_locations" ("enquiryId", "valueId")
SELECT "id", "locationValueId" FROM "enquiries" WHERE "locationValueId" IS NOT NULL;

INSERT INTO "enquiry_materials" ("enquiryId", "valueId")
SELECT "id", "materialValueId" FROM "enquiries" WHERE "materialValueId" IS NOT NULL;

-- AlterTable
ALTER TABLE "enquiries" DROP COLUMN "locationValueId",
DROP COLUMN "materialValueId",
ADD COLUMN     "contactPerson" TEXT;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "contactPerson" TEXT;
