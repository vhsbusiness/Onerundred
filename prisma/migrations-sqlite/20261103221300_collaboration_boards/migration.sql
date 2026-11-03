ALTER TABLE "Collaboration" ADD COLUMN "shareBoards" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "BoardEditRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "collaborationId" TEXT NOT NULL REFERENCES "Collaboration"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "boardId" TEXT NOT NULL REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BoardEditRequest_collaborationId_boardId_key" ON "BoardEditRequest"("collaborationId","boardId");
CREATE INDEX "BoardEditRequest_boardId_idx" ON "BoardEditRequest"("boardId");
