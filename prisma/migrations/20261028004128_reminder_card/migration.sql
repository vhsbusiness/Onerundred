-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN     "cardId" TEXT;

-- CreateIndex
CREATE INDEX "Reminder_cardId_idx" ON "Reminder"("cardId");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

