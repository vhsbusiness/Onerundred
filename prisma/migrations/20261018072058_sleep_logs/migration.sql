-- CreateTable
CREATE TABLE "SleepLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "bedAt" TIMESTAMP(3) NOT NULL,
    "sleepAt" TIMESTAMP(3) NOT NULL,
    "wakeAt" TIMESTAMP(3) NOT NULL,
    "quality" INTEGER,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SleepLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SleepLog_userId_wakeAt_idx" ON "SleepLog"("userId", "wakeAt");

-- CreateIndex
CREATE UNIQUE INDEX "SleepLog_userId_dayKey_key" ON "SleepLog"("userId", "dayKey");

-- AddForeignKey
ALTER TABLE "SleepLog" ADD CONSTRAINT "SleepLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

