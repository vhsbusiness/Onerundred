-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "originBoardId" TEXT;

-- CreateIndex
CREATE INDEX "Card_originBoardId_idx" ON "Card"("originBoardId");

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_originBoardId_fkey" FOREIGN KEY ("originBoardId") REFERENCES "Board"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Para registros anteriores, o único quadro conhecido é o da lista atual.
UPDATE "Card" SET "originBoardId" = (SELECT "boardId" FROM "List" WHERE "List"."id" = "Card"."listId");
