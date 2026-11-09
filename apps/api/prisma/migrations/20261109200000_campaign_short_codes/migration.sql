-- Short links (/c/<code>) for posters and QR codes. A code must point to one
-- campaign forever once printed, so it's stored and unique rather than read
-- from the slug's suffix (only the whole slug is unique).

-- Five characters from the slug-suffix alphabet: no 0/o or 1/l/i, because
-- codes are read out loud and typed from paper.
CREATE FUNCTION campaign_short_code() RETURNS TEXT LANGUAGE sql VOLATILE AS $$
  SELECT string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + floor(random() * 31)::int, 1), '')
  FROM generate_series(1, 5)
$$;

ALTER TABLE "Campaign" ADD COLUMN "shortCode" TEXT;

-- Existing campaigns keep their slug's suffix where it is a valid, unique code.
WITH candidates AS (
  SELECT "id", substring("slug" FROM '-([abcdefghjkmnpqrstuvwxyz23456789]{5})$') AS "code"
  FROM "Campaign"
),
unique_codes AS (
  SELECT "code" FROM candidates WHERE "code" IS NOT NULL GROUP BY "code" HAVING COUNT(*) = 1
)
UPDATE "Campaign" c SET "shortCode" = cand."code"
FROM candidates cand JOIN unique_codes u ON u."code" = cand."code"
WHERE c."id" = cand."id";

-- The rest get a fresh code that no campaign uses yet.
DO $$
DECLARE
  r RECORD;
  candidate TEXT;
BEGIN
  FOR r IN SELECT "id" FROM "Campaign" WHERE "shortCode" IS NULL LOOP
    LOOP
      candidate := campaign_short_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "Campaign" WHERE "shortCode" = candidate);
    END LOOP;
    UPDATE "Campaign" SET "shortCode" = candidate WHERE "id" = r."id";
  END LOOP;
END $$;

-- The application sets the code (the slug's suffix) when it creates a
-- campaign; the default only covers rows written some other way.
ALTER TABLE "Campaign" ALTER COLUMN "shortCode" SET DEFAULT campaign_short_code();
ALTER TABLE "Campaign" ALTER COLUMN "shortCode" SET NOT NULL;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_shortCode_format"
  CHECK ("shortCode" ~ '^[abcdefghjkmnpqrstuvwxyz23456789]{5}$');
CREATE UNIQUE INDEX "Campaign_shortCode_key" ON "Campaign"("shortCode");
