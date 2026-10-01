-- Quotation settings no longer carry an email; the code that wrote it is gone.
ALTER TABLE "quotation_settings" DROP COLUMN "email";
