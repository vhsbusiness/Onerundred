/**
 * Resolve a URL do banco e diz qual provider ela aponta.
 * Usado tanto pelo runtime (src/lib/db.ts) quanto pela CLI do Prisma
 * (prisma.config.ts), para os dois escolherem sempre o mesmo adaptador.
 */
export const DEFAULT_SQLITE_URL = "file:./prisma/dev.db";

export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return url;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL não definida. Em produção aponte para o Postgres (postgresql://...).",
    );
  }
  return DEFAULT_SQLITE_URL;
}

export function isSqliteUrl(url: string): boolean {
  return url.startsWith("file:");
}

export function isPostgresUrl(url: string): boolean {
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}
