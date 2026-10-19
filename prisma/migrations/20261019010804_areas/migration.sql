-- DropIndex
DROP INDEX "Board_userId_idx";

-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "area" TEXT NOT NULL DEFAULT 'pessoal';

-- AlterTable
ALTER TABLE "WorkSession" ADD COLUMN     "area" TEXT NOT NULL DEFAULT 'pessoal';

-- AlterTable
ALTER TABLE "AiInsight" ADD COLUMN     "area" TEXT NOT NULL DEFAULT 'pessoal';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "area" TEXT NOT NULL DEFAULT 'pessoal';

-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN     "area" TEXT NOT NULL DEFAULT 'pessoal';

-- CreateIndex
CREATE INDEX "Board_userId_area_idx" ON "Board"("userId", "area");

