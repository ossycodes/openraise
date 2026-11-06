ALTER TABLE "Donation" ADD COLUMN "donorName" TEXT,
ADD COLUMN "donorMessage" TEXT,
ADD COLUMN "isAnonymous" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_public_name_check" CHECK ("isAnonymous" OR ("donorName" IS NOT NULL AND length(trim("donorName")) > 0));
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_name_length_check" CHECK (length("donorName") <= 100);
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_message_length_check" CHECK (length("donorMessage") <= 500);
