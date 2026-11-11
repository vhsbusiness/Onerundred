-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "restSeconds" INTEGER NOT NULL DEFAULT 60;

-- CreateTable
CREATE TABLE "WorkoutPlan" (
    "projectId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "exercises" JSONB NOT NULL,

    CONSTRAINT "WorkoutPlan_pkey" PRIMARY KEY ("projectId","weekday")
);

-- CreateTable
CREATE TABLE "WorkoutLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "distanceMeters" INTEGER,
    "exercises" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutLog_pkey" PRIMARY KEY ("projectId","id")
);

-- CreateIndex
CREATE INDEX "WorkoutLog_projectId_dayKey_idx" ON "WorkoutLog"("projectId", "dayKey");

-- AddForeignKey
ALTER TABLE "WorkoutPlan" ADD CONSTRAINT "WorkoutPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
