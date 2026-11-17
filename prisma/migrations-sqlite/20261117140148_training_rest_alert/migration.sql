-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "restEndsAt" DATETIME;

-- CreateIndex
CREATE INDEX "Project_restEndsAt_idx" ON "Project"("restEndsAt");
