import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { isPostgresUrl, isSqliteUrl, resolveDatabaseUrl } from "./database-url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * O adaptador segue a DATABASE_URL:
 *   file:...          → SQLite (dev local)
 *   postgresql://...  → Postgres (Railway)
 * O client em src/generated/prisma precisa ter sido gerado para o mesmo provider
 * (prisma.config.ts cuida disso: `npx prisma generate` lê a mesma variável).
 */
function createAdapter() {
  const url = resolveDatabaseUrl();
  if (isPostgresUrl(url)) {
    return new PrismaPg({ connectionString: url });
  }
  if (isSqliteUrl(url)) {
    return new PrismaBetterSqlite3({ url });
  }
  throw new Error(
    `DATABASE_URL inválida: use "file:..." (SQLite) ou "postgresql://..." (Postgres).`,
  );
}

function createClient() {
  return new PrismaClient({ adapter: createAdapter() });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
