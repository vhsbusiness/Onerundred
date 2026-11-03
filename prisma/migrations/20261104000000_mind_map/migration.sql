CREATE TABLE "MindNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boardId" TEXT NOT NULL REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "parentId" TEXT REFERENCES "MindNode"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "title" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'orange',
    "x" INTEGER NOT NULL DEFAULT 0,
    "y" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "MindNode_boardId_idx" ON "MindNode"("boardId");
CREATE INDEX "MindNode_parentId_idx" ON "MindNode"("parentId");
