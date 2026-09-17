-- Username becomes the sign-in credential.
-- Added nullable first, backfilled from the existing email local-part, then
-- tightened to NOT NULL + UNIQUE so no existing account is orphaned.

ALTER TABLE "users" ADD COLUMN "username" TEXT;

UPDATE "users"
SET "username" = lower(regexp_replace(split_part("email", '@', 1), '[^A-Za-z0-9._-]', '', 'g'))
WHERE "username" IS NULL;

-- Guard against two emails collapsing to the same local-part.
UPDATE "users" u
SET "username" = u."username" || '_' || substr(u."id", 1, 4)
WHERE EXISTS (
  SELECT 1 FROM "users" o
  WHERE o."username" = u."username" AND o."id" <> u."id"
);

ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
