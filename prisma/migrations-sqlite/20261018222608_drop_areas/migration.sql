-- Volta atrás na separação por áreas (dev/SQLite): remove as colunas area.
DROP INDEX IF EXISTS "Board_userId_area_idx";
ALTER TABLE "Board" DROP COLUMN "area";
ALTER TABLE "WorkSession" DROP COLUMN "area";
ALTER TABLE "AiInsight" DROP COLUMN "area";
ALTER TABLE "Project" DROP COLUMN "area";
ALTER TABLE "Reminder" DROP COLUMN "area";
CREATE INDEX IF NOT EXISTS "Board_userId_idx" ON "Board"("userId");
