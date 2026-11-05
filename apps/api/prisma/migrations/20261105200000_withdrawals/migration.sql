-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('INITIALIZING', 'PENDING', 'UNCERTAIN', 'SUCCEEDED', 'FAILED', 'REVERSED');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "payoutFreezeReason" TEXT,
ADD COLUMN     "payoutsFrozen" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountLast4" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPayoutId" TEXT,
    "reference" TEXT NOT NULL,
    "idempotencyKeyHash" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "fee" BIGINT NOT NULL,
    "netPaidOut" BIGINT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'INITIALIZING',
    "reconciliationRequired" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "holdTransactionId" TEXT NOT NULL,
    "settlementTransactionId" TEXT,
    "reversalTransactionId" TEXT,
    "stateEventAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutFreezeEvent" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "frozen" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutFreezeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_reference_key" ON "Withdrawal"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_idempotencyKeyHash_key" ON "Withdrawal"("idempotencyKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_holdTransactionId_key" ON "Withdrawal"("holdTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_settlementTransactionId_key" ON "Withdrawal"("settlementTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_reversalTransactionId_key" ON "Withdrawal"("reversalTransactionId");

-- CreateIndex
CREATE INDEX "Withdrawal_campaignId_createdAt_idx" ON "Withdrawal"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "Withdrawal_userId_createdAt_idx" ON "Withdrawal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Withdrawal_status_idx" ON "Withdrawal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_provider_providerPayoutId_key" ON "Withdrawal"("provider", "providerPayoutId");

-- CreateIndex
CREATE INDEX "PayoutFreezeEvent_campaignId_createdAt_idx" ON "PayoutFreezeEvent"("campaignId", "createdAt");

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_holdTransactionId_fkey" FOREIGN KEY ("holdTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_settlementTransactionId_fkey" FOREIGN KEY ("settlementTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_reversalTransactionId_fkey" FOREIGN KEY ("reversalTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutFreezeEvent" ADD CONSTRAINT "PayoutFreezeEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutFreezeEvent" ADD CONSTRAINT "PayoutFreezeEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Immutable monetary snapshots must conserve every minor unit.
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_money_check"
CHECK ("amount" > 0 AND "fee" >= 0 AND "netPaidOut" > 0 AND "amount" = "fee" + "netPaidOut");
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_settlement_check"
CHECK ("status" <> 'SUCCEEDED' OR "settlementTransactionId" IS NOT NULL);
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_reversal_check"
CHECK ("status" NOT IN ('FAILED', 'REVERSED') OR "reversalTransactionId" IS NOT NULL);
