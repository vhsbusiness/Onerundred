-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AiInsight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "area" TEXT NOT NULL DEFAULT 'pessoal',
    "dayKey" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiInsight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AiInsight" ("completionTokens", "content", "createdAt", "dayKey", "id", "model", "promptTokens", "userId") SELECT "completionTokens", "content", "createdAt", "dayKey", "id", "model", "promptTokens", "userId" FROM "AiInsight";
DROP TABLE "AiInsight";
ALTER TABLE "new_AiInsight" RENAME TO "AiInsight";
CREATE INDEX "AiInsight_userId_dayKey_idx" ON "AiInsight"("userId", "dayKey");
CREATE TABLE "new_Board" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "area" TEXT NOT NULL DEFAULT 'pessoal',
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Board_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Board" ("createdAt", "id", "name", "position", "userId") SELECT "createdAt", "id", "name", "position", "userId" FROM "Board";
DROP TABLE "Board";
ALTER TABLE "new_Board" RENAME TO "Board";
CREATE INDEX "Board_userId_area_idx" ON "Board"("userId", "area");
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "area" TEXT NOT NULL DEFAULT 'pessoal',
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "obligations" TEXT NOT NULL DEFAULT '',
    "startDate" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" DATETIME,
    CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("archivedAt", "createdAt", "days", "description", "id", "name", "obligations", "startDate", "userId") SELECT "archivedAt", "createdAt", "days", "description", "id", "name", "obligations", "startDate", "userId" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE INDEX "Project_userId_idx" ON "Project"("userId");
CREATE TABLE "new_Reminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "area" TEXT NOT NULL DEFAULT 'pessoal',
    "title" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "at" DATETIME NOT NULL,
    "repeat" TEXT NOT NULL DEFAULT 'none',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Reminder" ("active", "at", "createdAt", "id", "lastSentAt", "note", "repeat", "title", "userId") SELECT "active", "at", "createdAt", "id", "lastSentAt", "note", "repeat", "title", "userId" FROM "Reminder";
DROP TABLE "Reminder";
ALTER TABLE "new_Reminder" RENAME TO "Reminder";
CREATE INDEX "Reminder_userId_at_idx" ON "Reminder"("userId", "at");
CREATE INDEX "Reminder_active_at_idx" ON "Reminder"("active", "at");
CREATE TABLE "new_WorkSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "area" TEXT NOT NULL DEFAULT 'pessoal',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    CONSTRAINT "WorkSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WorkSession" ("endedAt", "id", "startedAt", "userId") SELECT "endedAt", "id", "startedAt", "userId" FROM "WorkSession";
DROP TABLE "WorkSession";
ALTER TABLE "new_WorkSession" RENAME TO "WorkSession";
CREATE INDEX "WorkSession_userId_startedAt_idx" ON "WorkSession"("userId", "startedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
