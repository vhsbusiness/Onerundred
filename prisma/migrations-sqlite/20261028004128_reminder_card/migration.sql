ALTER TABLE "Reminder" ADD COLUMN "cardId" TEXT REFERENCES "Card" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Reminder_cardId_idx" ON "Reminder"("cardId");
