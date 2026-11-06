-- Identity verification (KYC). See docs/Features/Identity verification.md.

CREATE TYPE "IdentityVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

CREATE TYPE "IdentityDocumentType" AS ENUM ('NIN_SLIP', 'PASSPORT', 'DRIVERS_LICENCE', 'VOTERS_CARD');

CREATE TABLE "IdentityVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerReference" TEXT,
    "status" "IdentityVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "documentType" "IdentityDocumentType" NOT NULL,
    "idNumberLast4" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "verifiedName" TEXT,
    "documentKey" TEXT,
    "documentContentType" TEXT,
    "reason" TEXT,
    "reviewerId" TEXT,
    "decidedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "IdentityVerification_pkey" PRIMARY KEY ("id"),
    -- Only a suffix of the ID number is ever stored.
    CONSTRAINT "IdentityVerification_last4_check" CHECK (char_length("idNumberLast4") BETWEEN 1 AND 4),
    -- A decided row records when it was decided; a verified row has the confirmed name.
    CONSTRAINT "IdentityVerification_decision_check" CHECK (
      ("status" = 'PENDING' AND "decidedAt" IS NULL)
      OR ("status" <> 'PENDING' AND "decidedAt" IS NOT NULL)
    ),
    CONSTRAINT "IdentityVerification_verified_name_check" CHECK (
      "status" <> 'VERIFIED' OR "verifiedName" IS NOT NULL
    )
);

CREATE INDEX "IdentityVerification_userId_createdAt_idx" ON "IdentityVerification"("userId", "createdAt");

CREATE INDEX "IdentityVerification_status_createdAt_idx" ON "IdentityVerification"("status", "createdAt");

-- One open request per person: a second submission while one is pending is refused.
CREATE UNIQUE INDEX "IdentityVerification_one_pending_per_user" ON "IdentityVerification"("userId") WHERE "status" = 'PENDING';

ALTER TABLE "IdentityVerification" ADD CONSTRAINT "IdentityVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IdentityVerification" ADD CONSTRAINT "IdentityVerification_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
