-- Payout name reviews: an administrator can approve one payout account whose
-- bank name genuinely differs from the creator's verified name.
CREATE TYPE "PayoutNameReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED');

CREATE TABLE "PayoutNameReview" (
  "id" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "PayoutNameReviewStatus" NOT NULL DEFAULT 'PENDING',
  "explanation" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "verifiedName" TEXT NOT NULL,
  "reviewerId" TEXT,
  "reason" TEXT,
  "decidedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "PayoutNameReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayoutNameReview_explanation_length" CHECK (char_length("explanation") BETWEEN 10 AND 500),
  CONSTRAINT "PayoutNameReview_reason_length" CHECK ("reason" IS NULL OR char_length("reason") BETWEEN 5 AND 500),
  -- An administrator's decision names them and has a time; a decline says why.
  CONSTRAINT "PayoutNameReview_decided" CHECK (
    ("status" = 'PENDING' AND "decidedAt" IS NULL AND "reviewerId" IS NULL)
    OR ("status" = 'CANCELLED' AND "decidedAt" IS NOT NULL AND "reviewerId" IS NULL)
    OR ("status" IN ('APPROVED', 'DECLINED') AND "decidedAt" IS NOT NULL AND "reviewerId" IS NOT NULL)
  ),
  CONSTRAINT "PayoutNameReview_declined_reason" CHECK ("status" <> 'DECLINED' OR "reason" IS NOT NULL)
);

CREATE INDEX "PayoutNameReview_status_createdAt_idx" ON "PayoutNameReview"("status", "createdAt");
CREATE INDEX "PayoutNameReview_bankAccountId_createdAt_idx" ON "PayoutNameReview"("bankAccountId", "createdAt");
CREATE UNIQUE INDEX "PayoutNameReview_one_pending_per_account" ON "PayoutNameReview"("bankAccountId") WHERE "status" = 'PENDING';

ALTER TABLE "PayoutNameReview" ADD CONSTRAINT "PayoutNameReview_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutNameReview" ADD CONSTRAINT "PayoutNameReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutNameReview" ADD CONSTRAINT "PayoutNameReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ID photo retention: when the policy deleted a verified person's photo.
ALTER TABLE "IdentityVerification" ADD COLUMN "documentDeletedAt" TIMESTAMPTZ;
ALTER TABLE "IdentityVerification" ADD CONSTRAINT "IdentityVerification_document_deleted" CHECK ("documentDeletedAt" IS NULL OR "documentKey" IS NULL);

-- Uploaded ID photos not yet submitted, so abandoned ones can be deleted
-- without listing (and trusting) the whole bucket. Uploads from before this
-- migration aren't tracked.
CREATE TABLE "IdentityDocumentUpload" (
  "key" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdentityDocumentUpload_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "IdentityDocumentUpload_createdAt_idx" ON "IdentityDocumentUpload"("createdAt");
ALTER TABLE "IdentityDocumentUpload" ADD CONSTRAINT "IdentityDocumentUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The audit journal now also records ID photo deletions and payout name
-- reviews. Same rules as before: snapshots are built field by field and never
-- carry names, explanations, reasons or document keys.
CREATE OR REPLACE FUNCTION record_sensitive_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  b JSONB;
  a JSONB;
  kind TEXT;
  subject TEXT;
BEGIN
  IF TG_TABLE_NAME = 'User' THEN
    IF OLD.role IS NOT DISTINCT FROM NEW.role THEN RETURN NEW; END IF;
    b := jsonb_build_object('role', OLD.role);
    a := jsonb_build_object('role', NEW.role);
    kind := 'ROLE_CHANGED'; subject := NEW.id;
  ELSIF TG_TABLE_NAME = 'Campaign' THEN
    b := jsonb_build_object('status', OLD.status, 'moderationPaused', OLD."moderationPaused", 'payoutsFrozen', OLD."payoutsFrozen");
    a := jsonb_build_object('status', NEW.status, 'moderationPaused', NEW."moderationPaused", 'payoutsFrozen', NEW."payoutsFrozen");
    IF b = a THEN RETURN NEW; END IF;
    kind := 'CAMPAIGN_CHANGED'; subject := NEW."ownerId";
  ELSIF TG_TABLE_NAME = 'CampaignReport' THEN
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
    b := jsonb_build_object('status', OLD.status);
    a := jsonb_build_object('status', NEW.status);
    kind := 'REPORT_CHANGED';
  ELSIF TG_TABLE_NAME = 'IdentityVerification' THEN
    subject := NEW."userId";
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      b := jsonb_build_object('status', OLD.status);
      a := jsonb_build_object('status', NEW.status);
      kind := 'IDENTITY_DECIDED';
    ELSIF OLD."documentKey" IS NOT NULL AND NEW."documentKey" IS NULL THEN
      b := jsonb_build_object('document', true);
      a := jsonb_build_object('document', false);
      kind := 'IDENTITY_DOCUMENT_DELETED';
    ELSE
      RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'BankAccount' THEN
    IF TG_OP = 'UPDATE' THEN
      b := jsonb_build_object('isDefault', OLD."isDefault", 'removed', OLD."removedAt" IS NOT NULL);
    END IF;
    a := jsonb_build_object('isDefault', NEW."isDefault", 'removed', NEW."removedAt" IS NOT NULL);
    IF b = a THEN RETURN NEW; END IF;
    kind := CASE WHEN TG_OP = 'INSERT' THEN 'BANK_ACCOUNT_ADDED' ELSE 'BANK_ACCOUNT_CHANGED' END;
    subject := NEW."userId";
  ELSIF TG_TABLE_NAME = 'PayoutNameReview' THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
      b := jsonb_build_object('status', OLD.status);
      kind := 'PAYOUT_NAME_REVIEWED';
    ELSE
      kind := 'PAYOUT_NAME_REVIEW_REQUESTED';
    END IF;
    a := jsonb_build_object('status', NEW.status, 'bankAccountId', NEW."bankAccountId");
    subject := NEW."userId";
  END IF;
  INSERT INTO "AuditEvent" ("actorId", "action", "targetType", "targetId", "subjectId", "before", "after")
  VALUES (nullif(current_setting('openraise.audit_actor', true), ''), kind, TG_TABLE_NAME, NEW.id, subject, b, a);
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_payout_name AFTER INSERT OR UPDATE ON "PayoutNameReview" FOR EACH ROW EXECUTE FUNCTION record_sensitive_change();
