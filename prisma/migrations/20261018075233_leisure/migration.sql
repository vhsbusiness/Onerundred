-- CreateTable
CREATE TABLE "LeisureLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "activity" TEXT NOT NULL DEFAULT 'Jogos',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeisureLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeisureLog_userId_startAt_idx" ON "LeisureLog"("userId", "startAt");

-- AddForeignKey
ALTER TABLE "LeisureLog" ADD CONSTRAINT "LeisureLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

