-- Organisations: NGOs, charities, churches and companies that raise as a team.
CREATE TYPE "OrganisationRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'FINANCE');

CREATE TABLE "Organisation" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "about" TEXT NOT NULL DEFAULT '',
  "website" TEXT,
  "location" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Organisation_name_length" CHECK (char_length("name") BETWEEN 2 AND 100),
  CONSTRAINT "Organisation_about_length" CHECK (char_length("about") <= 2000),
  CONSTRAINT "Organisation_website_https" CHECK ("website" IS NULL OR "website" ~ '^https?://')
);
CREATE UNIQUE INDEX "Organisation_slug_key" ON "Organisation"("slug");
ALTER TABLE "Organisation" ADD CONSTRAINT "Organisation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OrganisationMember" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "OrganisationRole" NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "OrganisationMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrganisationMember_organisationId_userId_key" ON "OrganisationMember"("organisationId", "userId");
CREATE INDEX "OrganisationMember_userId_idx" ON "OrganisationMember"("userId");
ALTER TABLE "OrganisationMember" ADD CONSTRAINT "OrganisationMember_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganisationMember" ADD CONSTRAINT "OrganisationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OrganisationInvite" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "OrganisationRole" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "acceptedAt" TIMESTAMPTZ,
  "revokedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganisationInvite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrganisationInvite_email_lower" CHECK ("email" = lower("email")),
  CONSTRAINT "OrganisationInvite_closed_once" CHECK ("acceptedAt" IS NULL OR "revokedAt" IS NULL)
);
CREATE UNIQUE INDEX "OrganisationInvite_tokenHash_key" ON "OrganisationInvite"("tokenHash");
CREATE INDEX "OrganisationInvite_organisationId_createdAt_idx" ON "OrganisationInvite"("organisationId", "createdAt");
-- One open invitation per person per organisation; a new one replaces it.
CREATE UNIQUE INDEX "OrganisationInvite_one_open_per_email" ON "OrganisationInvite"("organisationId", "email")
  WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
ALTER TABLE "OrganisationInvite" ADD CONSTRAINT "OrganisationInvite_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganisationInvite" ADD CONSTRAINT "OrganisationInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Who joined, changed role or left, in the audit journal. Its own function
-- because removals only have OLD; same rules as record_sensitive_change():
-- controlled fields only, transaction-local actor, unattributed otherwise.
CREATE FUNCTION record_organisation_member_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_ RECORD;
  b JSONB;
  a JSONB;
  kind TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    row_ := NEW;
    a := jsonb_build_object('organisationId', NEW."organisationId", 'role', NEW.role);
    kind := 'ORG_MEMBER_ADDED';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role IS NOT DISTINCT FROM NEW.role THEN RETURN NEW; END IF;
    row_ := NEW;
    b := jsonb_build_object('organisationId', OLD."organisationId", 'role', OLD.role);
    a := jsonb_build_object('organisationId', NEW."organisationId", 'role', NEW.role);
    kind := 'ORG_ROLE_CHANGED';
  ELSE
    row_ := OLD;
    b := jsonb_build_object('organisationId', OLD."organisationId", 'role', OLD.role);
    kind := 'ORG_MEMBER_REMOVED';
  END IF;
  INSERT INTO "AuditEvent" ("actorId", "action", "targetType", "targetId", "subjectId", "before", "after")
  VALUES (nullif(current_setting('openraise.audit_actor', true), ''), kind, TG_TABLE_NAME, row_.id, row_."userId", b, a);
  RETURN row_;
END;
$$;
CREATE TRIGGER audit_organisation_member AFTER INSERT OR UPDATE OR DELETE ON "OrganisationMember"
FOR EACH ROW EXECUTE FUNCTION record_organisation_member_change();
