#!/usr/bin/env node
/**
 * Gera uma migration Postgres em prisma/migrations sem precisar de um Postgres
 * local: compara o prisma/schema.prisma atual com o último commitado (git HEAD),
 * ou com o vazio se ainda não existe migration nenhuma.
 *
 *   npm run db:pg-migration -- <nome>
 *
 * Rode ANTES de commitar a mudança do schema, senão o HEAD já vai estar igual.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const name = process.argv[2]?.replace(/[^a-zA-Z0-9_]+/g, "_");
if (!name) {
  console.error("Uso: npm run db:pg-migration -- <nome>");
  process.exit(1);
}

const schema = "prisma/schema.prisma";
const migrationsDir = "prisma/migrations";
const hasMigrations =
  existsSync(migrationsDir) &&
  readdirSync(migrationsDir, { withFileTypes: true }).some((d) => d.isDirectory());

let fromArgs = ["--from-empty"];
if (hasMigrations) {
  const previous = join(tmpdir(), `onerundred-schema-head-${Date.now()}.prisma`);
  const head = spawnSync("git", ["show", `HEAD:${schema}`], { encoding: "utf8" });
  if (head.status !== 0) {
    console.error(`Não consegui ler ${schema} do git HEAD. Commite o schema anterior primeiro.`);
    process.exit(1);
  }
  writeFileSync(previous, head.stdout);
  fromArgs = ["--from-schema", previous];
}

const sql = execFileSync(
  "npx",
  ["prisma", "migrate", "diff", ...fromArgs, "--to-schema", schema, "--script"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);

if (!sql.trim() || /This is an empty migration/.test(sql)) {
  console.log("Nenhuma diferença entre o schema atual e o anterior; nada gerado.");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const dir = join(migrationsDir, `${stamp}_${name}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "migration.sql"), sql);
console.log(`Migration Postgres gravada em ${dir}/migration.sql`);
