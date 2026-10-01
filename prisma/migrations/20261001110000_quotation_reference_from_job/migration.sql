-- Quotation references are now <prefix>/<location code>/<Job No>, so the
-- per-company running counter is no longer used.
ALTER TABLE "quotation_settings" DROP COLUMN "nextReferenceNo";
