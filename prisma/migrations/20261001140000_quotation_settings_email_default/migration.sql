-- The settings email is being retired. A default first, so the application,
-- which no longer writes it, can still create a settings row; the column is
-- dropped once that application is live.
ALTER TABLE "quotation_settings" ALTER COLUMN "email" SET DEFAULT '';
