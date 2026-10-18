-- CreateTable
CREATE TABLE "LeisureLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "activity" TEXT NOT NULL DEFAULT 'Jogos',
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeisureLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LeisureLog_userId_startAt_idx" ON "LeisureLog"("userId", "startAt");
