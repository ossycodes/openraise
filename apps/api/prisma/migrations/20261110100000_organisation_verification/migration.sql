-- Organisation verification from a registration certificate (CAC in Nigeria).
CREATE TYPE "OrganisationVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
CREATE TYPE "OrganisationRegistrationType" AS ENUM ('BUSINESS_NAME', 'COMPANY', 'INCORPORATED_TRUSTEES');

CREATE TABLE "OrganisationVerification" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "submittedById" TEXT NOT NULL,
  "status" "OrganisationVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "registrationType" "OrganisationRegistrationType" NOT NULL,
  "registrationNumber" TEXT NOT NULL,
  "registeredName" TEXT NOT NULL,
  "verifiedName" TEXT,
  "documentKey" TEXT,
  "documentContentType" TEXT,
  "reason" TEXT,
  "reviewerId" TEXT,
  "decidedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "OrganisationVerification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrganisationVerification_number_format" CHECK ("registrationNumber" ~ '^[A-Z0-9 /-]{3,20}$'),
  CONSTRAINT "OrganisationVerification_name_length" CHECK (char_length("registeredName") BETWEEN 2 AND 150),
  CONSTRAINT "OrganisationVerification_decided" CHECK (("status" = 'PENDING') = ("decidedAt" IS NULL)),
  CONSTRAINT "OrganisationVerification_verified_name" CHECK ("status" <> 'VERIFIED' OR "verifiedName" IS NOT NULL),
  CONSTRAINT "OrganisationVerification_rejected_reason" CHECK ("status" <> 'REJECTED' OR "reason" IS NOT NULL)
);
CREATE INDEX "OrganisationVerification_organisationId_createdAt_idx" ON "OrganisationVerification"("organisationId", "createdAt");
CREATE INDEX "OrganisationVerification_status_createdAt_idx" ON "OrganisationVerification"("status", "createdAt");
CREATE UNIQUE INDEX "OrganisationVerification_one_pending" ON "OrganisationVerification"("organisationId") WHERE "status" = 'PENDING';
ALTER TABLE "OrganisationVerification" ADD CONSTRAINT "OrganisationVerification_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganisationVerification" ADD CONSTRAINT "OrganisationVerification_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganisationVerification" ADD CONSTRAINT "OrganisationVerification_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Decisions in the audit journal, like identity decisions. The subject is
-- whoever submitted; the organisation is in the snapshot.
CREATE FUNCTION record_organisation_verification_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  INSERT INTO "AuditEvent" ("actorId", "action", "targetType", "targetId", "subjectId", "before", "after")
  VALUES (
    nullif(current_setting('openraise.audit_actor', true), ''),
    'ORG_VERIFICATION_DECIDED', TG_TABLE_NAME, NEW.id, NEW."submittedById",
    jsonb_build_object('organisationId', OLD."organisationId", 'status', OLD.status),
    jsonb_build_object('organisationId', NEW."organisationId", 'status', NEW.status)
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_organisation_verification AFTER UPDATE ON "OrganisationVerification"
FOR EACH ROW EXECUTE FUNCTION record_organisation_verification_change();
