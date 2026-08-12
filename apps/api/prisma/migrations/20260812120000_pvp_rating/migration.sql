-- AlterTable
ALTER TABLE "PvpDefense" ADD COLUMN IF NOT EXISTS "rating" INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE "PvpDefense" ADD COLUMN IF NOT EXISTS "ratingGames" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PvpDefense_rating_idx" ON "PvpDefense"("rating");
