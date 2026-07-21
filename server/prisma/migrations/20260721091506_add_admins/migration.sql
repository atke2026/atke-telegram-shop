-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "addedByTelegramId" BIGINT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_telegramId_key" ON "admins"("telegramId");
