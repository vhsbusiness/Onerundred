-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "restEndsAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Project_restEndsAt_idx" ON "Project"("restEndsAt");
