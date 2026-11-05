-- AlterTable: a generated column, so the index always matches the campaign's
-- text without the app maintaining it. English stemming ("schools" finds
-- "school") plus the simple dictionary so names and places match exactly.
-- Weights rank title matches above summary/location above story.
ALTER TABLE "Campaign" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("summary", '')), 'B') ||
  setweight(to_tsvector('simple', coalesce("location", '')), 'B') ||
  setweight(to_tsvector('english', coalesce("story", '')), 'C')
) STORED;

-- CreateIndex
CREATE INDEX "Campaign_searchVector_idx" ON "Campaign" USING GIN ("searchVector");
