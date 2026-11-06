-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'CAMPAIGN_UPDATE';

-- AlterTable
ALTER TABLE "Donation" ADD COLUMN     "updatesOptIn" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "NotificationDelivery" ADD COLUMN     "campaignUpdateId" TEXT,
ADD COLUMN     "updateSubscriptionId" TEXT;

-- CreateTable
CREATE TABLE "CampaignUpdate" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "uploadKeys" TEXT[],
    "idempotencyKeyHash" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hiddenAt" TIMESTAMPTZ,
    "hiddenById" TEXT,
    "fanoutCursor" TEXT,
    "fanoutCompletedAt" TIMESTAMPTZ,

    CONSTRAINT "CampaignUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignUpdateImage" (
    "id" TEXT NOT NULL,
    "updateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "CampaignUpdateImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignUpdateSubscription" (
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "donationId" TEXT NOT NULL,
    "consentedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribedAt" TIMESTAMPTZ,

    CONSTRAINT "CampaignUpdateSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CampaignUpdate_idempotencyKeyHash_key" ON "CampaignUpdate"("idempotencyKeyHash");

-- CreateIndex
CREATE INDEX "CampaignUpdate_campaignId_publishedAt_idx" ON "CampaignUpdate"("campaignId", "publishedAt");

-- CreateIndex
CREATE INDEX "CampaignUpdate_fanoutCompletedAt_idx" ON "CampaignUpdate"("fanoutCompletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignUpdateImage_key_key" ON "CampaignUpdateImage"("key");

-- CreateIndex
CREATE INDEX "CampaignUpdateImage_updateId_position_idx" ON "CampaignUpdateImage"("updateId", "position");

-- CreateIndex
CREATE INDEX "CampaignUpdateSubscription_campaignId_id_idx" ON "CampaignUpdateSubscription"("campaignId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignUpdateSubscription_campaignId_email_key" ON "CampaignUpdateSubscription"("campaignId", "email");

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_campaignUpdateId_fkey" FOREIGN KEY ("campaignUpdateId") REFERENCES "CampaignUpdate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_updateSubscriptionId_fkey" FOREIGN KEY ("updateSubscriptionId") REFERENCES "CampaignUpdateSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignUpdate" ADD CONSTRAINT "CampaignUpdate_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignUpdate" ADD CONSTRAINT "CampaignUpdate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignUpdateImage" ADD CONSTRAINT "CampaignUpdateImage_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "CampaignUpdate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignUpdateSubscription" ADD CONSTRAINT "CampaignUpdateSubscription_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignUpdateSubscription" ADD CONSTRAINT "CampaignUpdateSubscription_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "Donation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

