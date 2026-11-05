CREATE TYPE "DonationStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED');
CREATE TYPE "CheckoutState" AS ENUM ('INITIALIZING', 'READY', 'FAILED', 'UNCERTAIN');
CREATE TABLE "Donation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "campaignId" TEXT NOT NULL REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "donorUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "donorEmail" TEXT NOT NULL,
  "idempotencyKeyHash" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerCheckoutId" TEXT,
  "providerPaymentId" TEXT,
  "checkoutUrl" TEXT,
  "checkoutState" "CheckoutState" NOT NULL DEFAULT 'INITIALIZING',
  "status" "DonationStatus" NOT NULL DEFAULT 'PENDING',
  "amount" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "platformFee" BIGINT NOT NULL,
  "donorFee" BIGINT NOT NULL,
  "totalCharged" BIGINT NOT NULL,
  "netToCampaign" BIGINT NOT NULL,
  "donorCoversPlatformFee" BOOLEAN NOT NULL,
  "succeededAt" TIMESTAMPTZ,
  "stateEventAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "Donation_money_check" CHECK (
    "amount" > 0 AND "platformFee" >= 0 AND "donorFee" >= 0 AND "netToCampaign" >= 0
    AND "totalCharged" > 0 AND "totalCharged" = "netToCampaign" + "platformFee" + "donorFee"
  )
);
CREATE UNIQUE INDEX "Donation_idempotencyKeyHash_key" ON "Donation"("idempotencyKeyHash");
CREATE UNIQUE INDEX "Donation_reference_key" ON "Donation"("reference");
CREATE UNIQUE INDEX "Donation_provider_providerCheckoutId_key" ON "Donation"("provider", "providerCheckoutId");
CREATE UNIQUE INDEX "Donation_provider_providerPaymentId_key" ON "Donation"("provider", "providerPaymentId");
CREATE INDEX "Donation_campaignId_status_idx" ON "Donation"("campaignId", "status");
CREATE INDEX "Donation_donorUserId_idx" ON "Donation"("donorUserId");
