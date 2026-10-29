<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Onerundred — instruções para agentes

App Next.js 16 + React 19 + Tailwind v4 + Prisma 7 (Postgres em produção, SQLite em dev), em português do Brasil. Painel pessoal de produtividade do dono do repositório. Leia nesta ordem:

1. `docs/PROJECT_OVERVIEW.md` — o que o app é e todas as funcionalidades.
2. `docs/ARCHITECTURE.md` — stack, pastas, fluxo de requisição, banco, integrações.
3. `docs/BUSINESS_RULES.md` — regras de negócio com números (nota, atraso, performance, manutenção, IA, push).
4. `docs/DEVELOPMENT.md` — comandos, variáveis (só nomes), migrations, verificação, deploy.
5. `docs/MIGRATION_HANDOFF.md` — estado atual, preferências do dono, pendências e regras para não quebrar nada.
6. `docs/INTELIGENCIA.md` — referência completa (API inteira, modelo de dados campo a campo).

## Regras curtas

- Node via nvm: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH"` antes de `npm`/`npx`.
- Antes de entregar: `npx tsc --noEmit -p .`, `npx eslint src`, `npx next build`, e conferir a UI em 375 px e desktop. Não há testes automatizados.
- Commits locais; **`git push` só quando o dono mandar publicar** (push em `main` faz deploy no Railway).
- Regra de negócio fica em `src/lib/repo.ts` (sempre com `userId` + `boardAccess`); rotas em `src/app/api` só validam e chamam o lib; UI em `src/components`.
- Métricas são funções puras em `src/lib/metrics.ts`/`performance.ts`; mudou número, atualize `SettingsForm.tsx`, README e `docs/BUSINESS_RULES.md`.
- Schema: edite `prisma/schema.prisma`, gere migration SQLite e Postgres (`npm run db:pg-migration -- <nome>` antes de commitar), `prisma generate`. Nunca edite `prisma/schema.sqlite.prisma`.
- Datas de agendamento são `yyyy-MM-dd` no fuso do servidor (`src/lib/time.ts`).
- Cores só por tokens de `src/app/globals.css` (tema claro e design Atelier dependem disso). Confirmações via `askConfirm`/`notify`, datas via `DateField`, horas via `TimeField`.
- Segredos só em `.env`/Railway. Nunca em código, docs, commits ou mensagens.
- Não crie contas nem digite senhas em produção; não apague dados de produção sem OK explícito.
- Não reintroduzir "áreas Pessoal/Profissional" (descartado pelo dono).

- Studio v3 é o padrão global, autorizado pelo dono em 29/10/2026. Admins podem comparar v3/v2 só na própria conta. Preservar o Atelier v2 e o clássico v1; tipografia v3 unificada em Instrument Sans, inclusive cronômetros.
