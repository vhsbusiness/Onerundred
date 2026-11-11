-- CreateTable
CREATE TABLE "WorkoutPlan" (
    "projectId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "exercises" JSONB NOT NULL,

    PRIMARY KEY ("projectId", "weekday"),
    CONSTRAINT "WorkoutPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("projectId", "id"),
    CONSTRAINT "WorkoutLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "restSeconds" INTEGER NOT NULL DEFAULT 60;

-- CreateIndex
CREATE INDEX "WorkoutLog_projectId_dayKey_idx" ON "WorkoutLog"("projectId", "dayKey");
