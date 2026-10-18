-- CreateTable
CREATE TABLE "UndoAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UndoAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UndoAction_userId_createdAt_idx" ON "UndoAction"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "UndoAction" ADD CONSTRAINT "UndoAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

