-- References are derived as AWS/<location code>/<Job No>; the prefix and the
-- running counter are no longer read by the application.
ALTER TABLE "quotation_settings" DROP COLUMN "referencePrefix",
DROP COLUMN "nextReferenceNo";
