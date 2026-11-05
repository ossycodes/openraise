ALTER TABLE "Campaign" ADD COLUMN "videoUrl" TEXT;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_videoUrl_check"
CHECK ("videoUrl" IS NULL OR "videoUrl" ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$');
