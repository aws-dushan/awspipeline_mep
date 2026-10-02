-- A quotation version may carry a "Special Discounted Price" below its total.
ALTER TABLE "quotation_versions" ADD COLUMN "discountedPrice" DECIMAL(16,2);
