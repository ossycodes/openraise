-- CreateTable
CREATE TABLE "CampaignReview" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "submittedAt" TIMESTAMPTZ,
    "reviewedVersion" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignReview_campaignId_createdAt_idx" ON "CampaignReview"("campaignId", "createdAt");

-- AddForeignKey
ALTER TABLE "CampaignReview" ADD CONSTRAINT "CampaignReview_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignReview" ADD CONSTRAINT "CampaignReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Review history is an append-only decision record written with the transition.
ALTER TABLE "CampaignReview" ADD CONSTRAINT "CampaignReview_valid_decision"
  CHECK ("decision" IN ('APPROVE', 'REJECT'));
ALTER TABLE "CampaignReview" ADD CONSTRAINT "CampaignReview_rejection_reason"
  CHECK ("decision" <> 'REJECT' OR ("reason" IS NOT NULL AND length(btrim("reason")) BETWEEN 3 AND 1000));
