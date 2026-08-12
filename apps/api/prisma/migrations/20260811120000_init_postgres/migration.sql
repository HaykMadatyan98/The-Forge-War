-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "displayName" TEXT,
    "googleSub" TEXT,
    "appleSub" TEXT,
    "guestKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSave" (
    "id" TEXT NOT NULL,
    "playerId" TEXT,
    "guestId" TEXT,
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "GameSave_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_email_key" ON "Player"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Player_googleSub_key" ON "Player"("googleSub");

-- CreateIndex
CREATE UNIQUE INDEX "Player_appleSub_key" ON "Player"("appleSub");

-- CreateIndex
CREATE UNIQUE INDEX "Player_guestKey_key" ON "Player"("guestKey");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_playerId_idx" ON "Session"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "GameSave_playerId_key" ON "GameSave"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "GameSave_guestId_key" ON "GameSave"("guestId");

-- CreateIndex
CREATE INDEX "GameSave_guestId_idx" ON "GameSave"("guestId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSave" ADD CONSTRAINT "GameSave_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
