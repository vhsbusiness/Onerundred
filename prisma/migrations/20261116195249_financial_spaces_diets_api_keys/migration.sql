-- AlterTable
ALTER TABLE "User" ADD COLUMN     "apiEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "FinanceAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "space" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "openingCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FinanceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "destinationId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "cents" INTEGER NOT NULL,
    "settled" BOOLEAN NOT NULL,

    CONSTRAINT "FinanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBudget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "space" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "cents" INTEGER NOT NULL,

    CONSTRAINT "FinanceBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DietProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DietProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DietDay" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,

    CONSTRAINT "DietDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DietMeal" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "foods" TEXT NOT NULL,
    "calories" INTEGER,
    "eaten" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DietMeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCover" (
    "id" TEXT NOT NULL,
    "trainingId" TEXT,
    "dietId" TEXT,
    "imageData" TEXT NOT NULL,

    CONSTRAINT "ProjectCover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "suffix" TEXT NOT NULL,
    "grants" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalApiKey_pkey" PRIMARY KEY ("id")
);

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

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBudget" ADD CONSTRAINT "FinanceBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DietProject" ADD CONSTRAINT "DietProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DietDay" ADD CONSTRAINT "DietDay_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DietProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DietMeal" ADD CONSTRAINT "DietMeal_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "DietDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCover" ADD CONSTRAINT "ProjectCover_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCover" ADD CONSTRAINT "ProjectCover_dietId_fkey" FOREIGN KEY ("dietId") REFERENCES "DietProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalApiKey" ADD CONSTRAINT "PersonalApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
