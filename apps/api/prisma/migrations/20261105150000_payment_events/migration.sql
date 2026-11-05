CREATE TABLE "PaymentEvent" (
  "id" TEXT NOT NULL PRIMARY KEY, "provider" TEXT NOT NULL, "eventId" TEXT NOT NULL,
  "rawBody" BYTEA NOT NULL, "type" TEXT, "resourceId" TEXT, "reference" TEXT,
  "amount" BIGINT, "currency" TEXT,
  "occurredAt" TIMESTAMPTZ NOT NULL, "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMPTZ, "outcome" TEXT, "reason" TEXT, "lastDispatchAt" TIMESTAMPTZ
);
CREATE UNIQUE INDEX "PaymentEvent_provider_eventId_key" ON "PaymentEvent"("provider", "eventId");
CREATE INDEX "PaymentEvent_processedAt_lastDispatchAt_idx" ON "PaymentEvent"("processedAt", "lastDispatchAt");
ALTER TABLE "Donation" ADD COLUMN "ledgerTransactionId" TEXT REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Donation_ledgerTransactionId_key" ON "Donation"("ledgerTransactionId");
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_paid_posting_check" CHECK ("status" <> 'SUCCEEDED' OR "ledgerTransactionId" IS NOT NULL);
-- Checkout's monetary snapshot and routing identity cannot change after reservation.
CREATE FUNCTION protect_donation_snapshot() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."amount", NEW."currency", NEW."platformFee", NEW."donorFee", NEW."totalCharged", NEW."netToCampaign", NEW."donorCoversPlatformFee", NEW."reference", NEW."provider", NEW."campaignId", NEW."idempotencyKeyHash")
    IS DISTINCT FROM ROW(OLD."amount", OLD."currency", OLD."platformFee", OLD."donorFee", OLD."totalCharged", OLD."netToCampaign", OLD."donorCoversPlatformFee", OLD."reference", OLD."provider", OLD."campaignId", OLD."idempotencyKeyHash") THEN
    RAISE EXCEPTION 'Donation financial snapshot is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER donation_snapshot_immutable BEFORE UPDATE ON "Donation" FOR EACH ROW EXECUTE FUNCTION protect_donation_snapshot();
