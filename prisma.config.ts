import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "prisma/config";
import { isPostgresUrl, isSqliteUrl, resolveDatabaseUrl } from "./src/lib/database-url";

/**
 * Fonte da verdade: prisma/schema.prisma (provider postgresql, usado no Railway).
 * Para rodar local com SQLite, derivamos prisma/schema.sqlite.prisma trocando só
 * o provider — o arquivo é gerado aqui e fica fora do git.
 */
const POSTGRES_SCHEMA = "prisma/schema.prisma";
const SQLITE_SCHEMA = "prisma/schema.sqlite.prisma";

/**
 * Sem DATABASE_URL em produção (ex.: `npm install` rodando `prisma generate` num
 * build antes de as variáveis existirem), usamos um placeholder Postgres: gerar o
 * client não conecta em nada. O runtime (src/lib/db.ts) continua exigindo a variável.
 */
const BUILD_PLACEHOLDER_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";

function resolveUrlForCli(): string {
  try {
    return resolveDatabaseUrl();
  } catch {
    console.warn("[prisma.config] DATABASE_URL ausente; usando placeholder Postgres só para gerar o client.");
    return BUILD_PLACEHOLDER_URL;
  }
}

const url = resolveUrlForCli();

if (!isSqliteUrl(url) && !isPostgresUrl(url)) {
  throw new Error(
    `DATABASE_URL inválida: use "file:..." (SQLite) ou "postgresql://..." (Postgres). Recebido: ${url}`,
  );
}

const sqlite = isSqliteUrl(url);

if (sqlite) {
  const source = readFileSync(POSTGRES_SCHEMA, "utf8");
  const derived = source.replace(
    /provider\s*=\s*"postgresql"/,
    'provider = "sqlite"',
  );
  if (derived === source) {
    throw new Error(`Não achei provider = "postgresql" em ${POSTGRES_SCHEMA}.`);
  }
  mkdirSync("prisma", { recursive: true });
  writeFileSync(
    SQLITE_SCHEMA,
    `// GERADO por prisma.config.ts a partir de ${POSTGRES_SCHEMA}. Não edite.\n\n${derived}`,
  );
}

export default defineConfig({
  schema: sqlite ? SQLITE_SCHEMA : POSTGRES_SCHEMA,
  migrations: {
    // Postgres: migrations versionadas, aplicadas no Railway com `prisma migrate deploy`.
    // SQLite: pasta separada só para o dev local (gerada por `prisma migrate dev`).
    path: sqlite ? "prisma/migrations-sqlite" : "prisma/migrations",
  },
  datasource: { url },
});
