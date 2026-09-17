-- Only ten fields are mandatory on a request, and the enquiry date is not one
-- of them: a request can be logged before its date is known.
ALTER TABLE "enquiries" ALTER COLUMN "enquiryDate" DROP NOT NULL;
