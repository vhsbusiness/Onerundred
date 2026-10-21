-- CreateTable
CREATE TABLE "CardPostponement" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardPostponement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardPostponement_cardId_dayKey_key" ON "CardPostponement"("cardId", "dayKey");

-- AddForeignKey
ALTER TABLE "CardPostponement" ADD CONSTRAINT "CardPostponement_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

