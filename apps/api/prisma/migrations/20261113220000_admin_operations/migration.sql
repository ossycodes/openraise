CREATE TABLE "DeploymentSettings" (
  "id" TEXT PRIMARY KEY,
  "values" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMPTZ NOT NULL
);
ALTER TABLE "Withdrawal" ADD COLUMN "retryOfId" TEXT;
CREATE UNIQUE INDEX "Withdrawal_retryOfId_key" ON "Withdrawal"("retryOfId");
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_retryOfId_fkey" FOREIGN KEY ("retryOfId") REFERENCES "Withdrawal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
