CREATE TABLE "RecurringTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priority" INTEGER NOT NULL DEFAULT 2,
    "estimatedMinutes" INTEGER,
    "weekdays" TEXT NOT NULL DEFAULT '1,2,3,4,5',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSpawnedKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecurringTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecurringTask_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RecurringTask_userId_idx" ON "RecurringTask"("userId");
CREATE INDEX "RecurringTask_active_idx" ON "RecurringTask"("active");
ALTER TABLE "Card" ADD COLUMN "recurringId" TEXT REFERENCES "RecurringTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
