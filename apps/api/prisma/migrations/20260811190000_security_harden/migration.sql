-- Security harden: email verify, drop guest saves, PvP matches

-- Grandfather existing players as verified so dev accounts keep working
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Player" SET "emailVerified" = true;

ALTER TABLE "Player" DROP COLUMN IF EXISTS "guestKey";

-- Drop guest cloud saves; player-owned only
DELETE FROM "GameSave" WHERE "playerId" IS NULL;
DROP INDEX IF EXISTS "GameSave_guestId_key";
DROP INDEX IF EXISTS "GameSave_guestId_idx";
ALTER TABLE "GameSave" DROP COLUMN IF EXISTS "guestId";
ALTER TABLE "GameSave" ALTER COLUMN "playerId" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "EmailVerifyToken" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailVerifyToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailVerifyToken_tokenHash_key" ON "EmailVerifyToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "EmailVerifyToken_playerId_idx" ON "EmailVerifyToken"("playerId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EmailVerifyToken_playerId_fkey'
  ) THEN
    ALTER TABLE "EmailVerifyToken"
      ADD CONSTRAINT "EmailVerifyToken_playerId_fkey"
      FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PvpMatch" (
    "id" TEXT NOT NULL,
    "attackerId" TEXT NOT NULL,
    "defenderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "victory" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "PvpMatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PvpMatch_attackerId_createdAt_idx" ON "PvpMatch"("attackerId", "createdAt");
CREATE INDEX IF NOT EXISTS "PvpMatch_defenderId_createdAt_idx" ON "PvpMatch"("defenderId", "createdAt");
CREATE INDEX IF NOT EXISTS "PvpMatch_status_expiresAt_idx" ON "PvpMatch"("status", "expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PvpMatch_attackerId_fkey'
  ) THEN
    ALTER TABLE "PvpMatch"
      ADD CONSTRAINT "PvpMatch_attackerId_fkey"
      FOREIGN KEY ("attackerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PvpMatch_defenderId_fkey'
  ) THEN
    ALTER TABLE "PvpMatch"
      ADD CONSTRAINT "PvpMatch_defenderId_fkey"
      FOREIGN KEY ("defenderId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
