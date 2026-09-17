-- The short code duplicated the company name everywhere it appeared, so the
-- name becomes the unique identity and chips derive their initials from it.
ALTER TABLE "companies" DROP COLUMN "code";
CREATE UNIQUE INDEX "companies_name_key" ON "companies"("name");
