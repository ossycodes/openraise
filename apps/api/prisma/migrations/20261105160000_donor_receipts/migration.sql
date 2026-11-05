CREATE TYPE "NotificationKind" AS ENUM ('DONOR_RECEIPT', 'CREATOR_DONATIONS');
CREATE TYPE "NotificationState" AS ENUM ('PENDING', 'SENDING', 'SENT', 'UNCERTAIN', 'FAILED');
CREATE TABLE "NotificationDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY, "dedupeKey" TEXT NOT NULL,
  "kind" "NotificationKind" NOT NULL, "recipient" TEXT NOT NULL,
  "campaignTitle" TEXT NOT NULL, "campaignUrl" TEXT NOT NULL, "currency" TEXT NOT NULL,
  "subject" TEXT, "text" TEXT, "html" TEXT,
  "state" "NotificationState" NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMPTZ, "sentAt" TIMESTAMPTZ, "lastError" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX "NotificationDelivery_dedupeKey_key" ON "NotificationDelivery"("dedupeKey");
CREATE INDEX "NotificationDelivery_state_nextAttemptAt_idx" ON "NotificationDelivery"("state", "nextAttemptAt");
CREATE INDEX "NotificationDelivery_state_startedAt_idx" ON "NotificationDelivery"("state", "startedAt");
CREATE TABLE "DonationNotification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "donationId" TEXT NOT NULL REFERENCES "Donation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "kind" "NotificationKind" NOT NULL,
  "deliveryId" TEXT NOT NULL REFERENCES "NotificationDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DonationNotification_donationId_kind_key" ON "DonationNotification"("donationId", "kind");
CREATE INDEX "DonationNotification_deliveryId_idx" ON "DonationNotification"("deliveryId");
