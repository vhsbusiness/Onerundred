-- AlterTable
ALTER TABLE "MindUndo" ADD COLUMN     "undone" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MindNode" ADD COLUMN     "textHeight" INTEGER,
ADD COLUMN     "textWidth" INTEGER;
