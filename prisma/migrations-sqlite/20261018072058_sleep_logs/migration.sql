-- CreateTable
CREATE TABLE "SleepLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "bedAt" DATETIME NOT NULL,
    "sleepAt" DATETIME NOT NULL,
    "wakeAt" DATETIME NOT NULL,
    "quality" INTEGER,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SleepLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SleepLog_userId_wakeAt_idx" ON "SleepLog"("userId", "wakeAt");

-- CreateIndex
CREATE UNIQUE INDEX "SleepLog_userId_dayKey_key" ON "SleepLog"("userId", "dayKey");
