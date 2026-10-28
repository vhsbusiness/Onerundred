-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "recurringId" TEXT;

-- CreateTable
CREATE TABLE "RecurringTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priority" INTEGER NOT NULL DEFAULT 2,
    "estimatedMinutes" INTEGER,
    "weekdays" TEXT NOT NULL DEFAULT '1,2,3,4,5',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSpawnedKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringTask_userId_idx" ON "RecurringTask"("userId");

-- CreateIndex
CREATE INDEX "RecurringTask_active_idx" ON "RecurringTask"("active");

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTask" ADD CONSTRAINT "RecurringTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTask" ADD CONSTRAINT "RecurringTask_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE CASCADE ON UPDATE CASCADE;

