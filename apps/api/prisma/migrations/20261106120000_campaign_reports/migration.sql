-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "moderationPauseReason" TEXT,
ADD COLUMN     "moderationPaused" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CampaignReport" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "idempotencyKeyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "closedAt" TIMESTAMPTZ,

    CONSTRAINT "CampaignReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportModerationAction" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CampaignReport_idempotencyKeyHash_key" ON "CampaignReport"("idempotencyKeyHash");

-- CreateIndex
CREATE INDEX "CampaignReport_status_createdAt_idx" ON "CampaignReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignReport_campaignId_idx" ON "CampaignReport"("campaignId");

-- CreateIndex
CREATE INDEX "ReportModerationAction_reportId_createdAt_idx" ON "ReportModerationAction"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "ReportModerationAction_campaignId_createdAt_idx" ON "ReportModerationAction"("campaignId", "createdAt");

-- AddForeignKey
ALTER TABLE "CampaignReport" ADD CONSTRAINT "CampaignReport_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportModerationAction" ADD CONSTRAINT "ReportModerationAction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "CampaignReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportModerationAction" ADD CONSTRAINT "ReportModerationAction_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportModerationAction" ADD CONSTRAINT "ReportModerationAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CampaignReport" ADD CONSTRAINT "CampaignReport_category_check" CHECK ("category" IN ('FRAUD','MISLEADING','OFFENSIVE','OTHER'));
ALTER TABLE "CampaignReport" ADD CONSTRAINT "CampaignReport_details_check" CHECK (length(btrim("details")) BETWEEN 20 AND 2000);
ALTER TABLE "CampaignReport" ADD CONSTRAINT "CampaignReport_state_check" CHECK (("status"='OPEN' AND "closedAt" IS NULL) OR ("status" IN ('RESOLVED','DISMISSED') AND "closedAt" IS NOT NULL));
ALTER TABLE "ReportModerationAction" ADD CONSTRAINT "ReportModerationAction_action_check" CHECK ("action" IN ('PAUSE','LIFT_PAUSE','FREEZE','UNFREEZE','RESOLVE','DISMISS'));
ALTER TABLE "ReportModerationAction" ADD CONSTRAINT "ReportModerationAction_reason_check" CHECK (length(btrim("reason")) BETWEEN 5 AND 500);
