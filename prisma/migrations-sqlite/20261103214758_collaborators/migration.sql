CREATE TABLE "Collaboration" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "managerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "employeeId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "accepted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Collaboration_managerId_employeeId_key" ON "Collaboration"("managerId","employeeId");
CREATE INDEX "Collaboration_employeeId_accepted_idx" ON "Collaboration"("employeeId","accepted");
