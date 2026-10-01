-- A user's direct line and extension, printed as the sales contact on the
-- quotations they are responsible for.
ALTER TABLE "users" ADD COLUMN "phone" TEXT,
ADD COLUMN "phoneExt" TEXT;
