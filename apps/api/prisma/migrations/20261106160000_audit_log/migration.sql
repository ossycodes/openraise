-- No backfill: old records do not prove an actor or original before-state.
CREATE TABLE "AuditEvent" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "subjectId" TEXT,
  "before" JSONB,
  "after" JSONB
);
CREATE INDEX "AuditEvent_createdAt_id_idx" ON "AuditEvent"("createdAt", "id");
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");
CREATE INDEX "AuditEvent_targetType_targetId_createdAt_idx" ON "AuditEvent"("targetType", "targetId", "createdAt");
CREATE INDEX "AuditEvent_subjectId_createdAt_idx" ON "AuditEvent"("subjectId", "createdAt");
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");

CREATE FUNCTION audit_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are append-only';
END;
$$;
CREATE TRIGGER audit_event_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON "AuditEvent"
FOR EACH STATEMENT EXECUTE FUNCTION audit_event_immutable();

-- Construct snapshots field by field. Never copy an entire source row into JSON.
-- The actor is a transaction-local application context, never a client header.
-- Direct database writes without context remain explicitly unattributed.
CREATE FUNCTION record_sensitive_change() RETURNS trigger LANGUAGE plpgsql AS $$
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
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
    b := jsonb_build_object('status', OLD.status);
    a := jsonb_build_object('status', NEW.status);
    kind := 'IDENTITY_DECIDED'; subject := NEW."userId";
  ELSIF TG_TABLE_NAME = 'BankAccount' THEN
    IF TG_OP = 'UPDATE' THEN
      b := jsonb_build_object('isDefault', OLD."isDefault", 'removed', OLD."removedAt" IS NOT NULL);
    END IF;
    a := jsonb_build_object('isDefault', NEW."isDefault", 'removed', NEW."removedAt" IS NOT NULL);
    IF b = a THEN RETURN NEW; END IF;
    kind := CASE WHEN TG_OP = 'INSERT' THEN 'BANK_ACCOUNT_ADDED' ELSE 'BANK_ACCOUNT_CHANGED' END;
    subject := NEW."userId";
  END IF;
  INSERT INTO "AuditEvent" ("actorId", "action", "targetType", "targetId", "subjectId", "before", "after")
  VALUES (nullif(current_setting('openraise.audit_actor', true), ''), kind, TG_TABLE_NAME, NEW.id, subject, b, a);
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_role AFTER UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION record_sensitive_change();
CREATE TRIGGER audit_campaign AFTER UPDATE ON "Campaign" FOR EACH ROW EXECUTE FUNCTION record_sensitive_change();
CREATE TRIGGER audit_report AFTER UPDATE ON "CampaignReport" FOR EACH ROW EXECUTE FUNCTION record_sensitive_change();
CREATE TRIGGER audit_identity AFTER UPDATE ON "IdentityVerification" FOR EACH ROW EXECUTE FUNCTION record_sensitive_change();
CREATE TRIGGER audit_bank AFTER INSERT OR UPDATE ON "BankAccount" FOR EACH ROW EXECUTE FUNCTION record_sensitive_change();
