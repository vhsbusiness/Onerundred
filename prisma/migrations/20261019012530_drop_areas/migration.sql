-- Volta atrás na separação por áreas: tudo num só lugar.
-- Antes de apagar a coluna, remove os quadros "Trabalho" vazios criados automaticamente na área Profissional.
DELETE FROM "Board" b
WHERE b.area = 'profissional'
  AND NOT EXISTS (SELECT 1 FROM "Card" c JOIN "List" l ON l.id = c."listId" WHERE l."boardId" = b.id);

-- DropIndex
DROP INDEX "Board_userId_area_idx";

-- AlterTable
ALTER TABLE "Board" DROP COLUMN "area";

-- AlterTable
ALTER TABLE "WorkSession" DROP COLUMN "area";

-- AlterTable
ALTER TABLE "AiInsight" DROP COLUMN "area";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "area";

-- AlterTable
ALTER TABLE "Reminder" DROP COLUMN "area";

-- CreateIndex
CREATE INDEX "Board_userId_idx" ON "Board"("userId");

