-- AlterTable
ALTER TABLE "Collaboration" ADD COLUMN     "shareBoards" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BoardEditRequest" (
    "id" TEXT NOT NULL,
    "collaborationId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,

    CONSTRAINT "BoardEditRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoardEditRequest_boardId_idx" ON "BoardEditRequest"("boardId");

-- CreateIndex
CREATE UNIQUE INDEX "BoardEditRequest_collaborationId_boardId_key" ON "BoardEditRequest"("collaborationId", "boardId");

-- AddForeignKey
ALTER TABLE "BoardEditRequest" ADD CONSTRAINT "BoardEditRequest_collaborationId_fkey" FOREIGN KEY ("collaborationId") REFERENCES "Collaboration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardEditRequest" ADD CONSTRAINT "BoardEditRequest_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

