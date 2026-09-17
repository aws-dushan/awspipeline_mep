-- Job numbers read <prefix><number>_<suffix>, e.g. J1000_DXB. The suffix is a
-- country or branch code set per company; empty means no suffix and no
-- separator, which is what every existing company gets.
ALTER TABLE "company_counters" ADD COLUMN "jobNoSuffix" TEXT NOT NULL DEFAULT '';
