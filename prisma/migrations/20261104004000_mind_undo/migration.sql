-- CreateTable
CREATE TABLE "MindUndo" (
    "id" SERIAL NOT NULL,
    "boardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payload" TEXT NOT NULL,

    CONSTRAINT "MindUndo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MindUndo_boardId_userId_id_idx" ON "MindUndo"("boardId", "userId", "id");

-- AddForeignKey
ALTER TABLE "MindUndo" ADD CONSTRAINT "MindUndo_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MindUndo" ADD CONSTRAINT "MindUndo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
