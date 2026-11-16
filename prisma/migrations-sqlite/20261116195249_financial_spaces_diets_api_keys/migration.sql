-- CreateTable
CREATE TABLE "FinanceAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "space" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "openingCents" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "FinanceAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinanceEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "destinationId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "cents" INTEGER NOT NULL,
    "settled" BOOLEAN NOT NULL,
    CONSTRAINT "FinanceEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinanceEntry_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "FinanceAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinanceBudget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "space" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "cents" INTEGER NOT NULL,
    CONSTRAINT "FinanceBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DietProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DietProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DietDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    CONSTRAINT "DietDay_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DietProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DietMeal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dayId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "foods" TEXT NOT NULL,
    "calories" INTEGER,
    "eaten" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DietMeal_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "DietDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectCover" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainingId" TEXT,
    "dietId" TEXT,
    "imageData" TEXT NOT NULL,
    CONSTRAINT "ProjectCover_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectCover_dietId_fkey" FOREIGN KEY ("dietId") REFERENCES "DietProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PersonalApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "suffix" TEXT NOT NULL,
    "grants" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonalApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "avatar" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" DATETIME,
    "apiEnabled" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_User" ("active", "avatar", "createdAt", "email", "id", "lastLoginAt", "name", "passwordHash", "role", "username") SELECT "active", "avatar", "createdAt", "email", "id", "lastLoginAt", "name", "passwordHash", "role", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccount_userId_space_name_key" ON "FinanceAccount"("userId", "space", "name");

-- CreateIndex
CREATE INDEX "FinanceEntry_accountId_dayKey_idx" ON "FinanceEntry"("accountId", "dayKey");

-- CreateIndex
CREATE INDEX "FinanceEntry_destinationId_idx" ON "FinanceEntry"("destinationId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBudget_userId_space_month_category_key" ON "FinanceBudget"("userId", "space", "month", "category");

-- CreateIndex
CREATE INDEX "DietProject_userId_createdAt_idx" ON "DietProject"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DietDay_projectId_dayKey_key" ON "DietDay"("projectId", "dayKey");

-- CreateIndex
CREATE INDEX "DietMeal_dayId_time_idx" ON "DietMeal"("dayId", "time");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCover_trainingId_key" ON "ProjectCover"("trainingId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCover_dietId_key" ON "ProjectCover"("dietId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalApiKey_digest_key" ON "PersonalApiKey"("digest");

-- CreateIndex
CREATE INDEX "PersonalApiKey_userId_idx" ON "PersonalApiKey"("userId");
