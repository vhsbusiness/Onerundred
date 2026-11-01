-- CreateTable
CREATE TABLE "BoardLabel" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "BoardLabel_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BoardLabel_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BoardLabel_boardId_key_key" ON "BoardLabel"("boardId", "key");

