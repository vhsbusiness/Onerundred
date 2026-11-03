UPDATE "Collaboration"
SET "shareBoards" = true
WHERE "accepted" = true AND "shareBoards" = false;
