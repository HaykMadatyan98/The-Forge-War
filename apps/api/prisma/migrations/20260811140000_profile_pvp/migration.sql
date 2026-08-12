-- Profile avatar + async PvP defense boards

ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "avatarKey" TEXT;

CREATE TABLE IF NOT EXISTS "PvpDefense" (
    "playerId" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarKey" TEXT,
    "power" INTEGER NOT NULL DEFAULT 0,
    "squadJson" TEXT NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PvpDefense_pkey" PRIMARY KEY ("playerId")
);

CREATE INDEX IF NOT EXISTS "PvpDefense_power_idx" ON "PvpDefense"("power");
CREATE INDEX IF NOT EXISTS "PvpDefense_updatedAt_idx" ON "PvpDefense"("updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PvpDefense_playerId_fkey'
  ) THEN
    ALTER TABLE "PvpDefense"
      ADD CONSTRAINT "PvpDefense_playerId_fkey"
      FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
